// 06.1-18 (D-14, D-25, D-28): before the first answer, the one-time "How Decide answers" card, then one safety-net question. Later
// checks go straight through. An amount makes the flagged Grow goal (locked) or sizes the one that exists; "Not set yet" makes
// nothing and stamps the flag. Neither step unlocks the net: only the safety-net settings screen does (D-20).
// Mounted by the answer route before the first answer renders; `onDone` fires once when nothing is left to ask.
import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useDecideV3 } from '@/data/queries/decideV3';
import { INTRO_KEYS } from '@/engine/decide/v3';
import { currencyCode, minorUnits } from '@/engine/money';
import { useRecordContext } from '@/features/record/useRecordContext';
import { essentialMonthOf } from '@/features/grow/safetyNet/netPreview';
import { useT } from '@/i18n';
import { pushOnce } from '@/shell/navigation/pushOnce';
import { space, useScreenInsets } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { textRole } from '@/theme/typography';
import { MoneyInput } from '@/ui/MoneyInput';
import { Pill } from '@/ui/Pill';
import { useMoneyFormatter } from '@/ui/money/useMoneyFormatter';
import { Sheet, SheetScroll } from '@/ui/Sheet';
import { Text } from '@/ui/Text';
import type { NetAnswerPort } from '../safetyNet/ports';
import { OfflineCard } from '../answer/StatusCards';
import { useFirstAnswerGate } from './useFirstAnswerGate';

type Translate = (key: string, params?: Record<string, string | number>) => string;

const GROW_NET = '/grow/safety-net' as const;

export interface FirstAnswerGateProps {
  /** The first-answer net write, bound by src/shell/decide/FirstAnswerGateBound.tsx. */
  answer: NetAnswerPort;
  onDone: () => void;
}

type Step = 'intro' | 'net' | 'done';

export function FirstAnswerGate({ answer, onDone }: FirstAnswerGateProps): React.JSX.Element | null {
  const gate = useFirstAnswerGate();
  const [step, setStep] = useState<Step | null>(null);

  // Decide what to ask once, when the reads settle (set during render, the React way to derive state once); answering a step never
  // re-derives the plan.
  if (step === null && !gate.loading) setStep(gate.needsIntro ? 'intro' : gate.needsNet ? 'net' : 'done');

  useEffect(() => {
    if (step === 'done') onDone();
  }, [step, onDone]);

  const afterIntro = (): void => setStep(gate.needsNet ? 'net' : 'done');

  // 06.1-52 (C-19): offline with nothing cached, the gate cannot settle; the offline card says so instead of a blank screen.
  if (step === null && gate.offline) return <GateOffline onRetry={gate.retry} />;

  return (
    <>
      <IntroCard
        visible={step === 'intro'}
        onGotIt={() => {
          void gate.markIntroSeen();
          afterIntro();
        }}
        // Dismissing without Got it moves on but is not remembered, so the card shows again next time.
        onDismiss={afterIntro}
      />
      <NetQuestionSheet answer={answer} visible={step === 'net'} onDone={() => setStep('done')} onDismiss={() => setStep('done')} />
    </>
  );
}

function GateOffline({ onRetry }: { onRetry: () => void }): React.JSX.Element {
  const { colors } = useTheme();
  const insets = useScreenInsets();
  const rc = useRecordContext();
  const v3 = useDecideV3();
  const fmt = useMoneyFormatter(false, rc.homeCurrency);
  const asOf = v3.inputs?.recordsAsOf ?? rc.today;
  return (
    <View testID="gate-offline" style={[styles.offline, { backgroundColor: colors.canvas, paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <OfflineCard date={fmt.formatDate(asOf)} onRetry={onRetry} />
    </View>
  );
}

function IntroCard({ visible, onGotIt, onDismiss }: { visible: boolean; onGotIt: () => void; onDismiss: () => void }): React.JSX.Element {
  const t = useT() as unknown as Translate;
  const { colors, pairing } = useTheme();
  return (
    <Sheet visible={visible} onDismiss={onDismiss}>
      <SheetScroll>
        <View style={styles.column}>
          <Text accessibilityRole="header" style={{ ...textRole(pairing, 'sheetTitle'), color: colors.ink }}>
            {t(INTRO_KEYS.title)}
          </Text>
          {INTRO_KEYS.lines.map((key) => (
            <Text key={key} style={{ ...textRole(pairing, 'body'), color: colors.ink }}>
              {t(key)}
            </Text>
          ))}
          <Pill label={t(INTRO_KEYS.gotIt)} variant="primary" onPress={onGotIt} />
        </View>
      </SheetScroll>
    </Sheet>
  );
}

export interface NetQuestionSheetProps {
  answer: NetAnswerPort;
  visible: boolean;
  /** After the question is answered (an amount saved, or Not set yet). */
  onDone: () => void;
  /** Swipe-down or back: nothing is written. */
  onDismiss: () => void;
}

/** The D-14 question: "Do you have a safety net? About how much?" Also opened from the safety-net settings empty state. */
export function NetQuestionSheet({ answer, visible, onDone, onDismiss }: NetQuestionSheetProps): React.JSX.Element | null {
  return visible ? <NetQuestionBody answer={answer} onDone={onDone} onDismiss={onDismiss} /> : null;
}

function NetQuestionBody({ answer, onDone, onDismiss }: { answer: NetAnswerPort; onDone: () => void; onDismiss: () => void }): React.JSX.Element {
  const t = useT() as unknown as Translate;
  const { colors, pairing } = useTheme();
  const rc = useRecordContext();
  const currency = rc.homeCurrency;
  const fmt = useMoneyFormatter(false, currency);
  const v3 = useDecideV3();
  const [amount, setAmount] = useState<number | null>(null);
  const [otherCurrency, setOtherCurrency] = useState(false);

  let starter: number | null = null;
  if (v3.source != null) {
    try {
      starter = essentialMonthOf(v3.source, v3.v3 ?? null);
    } catch {
      starter = null;
    }
  }
  const ready = amount !== null && amount > 0 && rc.userId !== null && rc.householdId !== null;

  const save = (): void => {
    if (!ready || amount === null) return;
    const outcome = answer({ kind: 'amount', amount, currency, name: t('decide.screens.safetyNet.settings.title') });
    if (outcome.status === 'other_currency') setOtherCurrency(true);
    else onDone();
  };
  const notSet = (): void => {
    answer({ kind: 'not_set' });
    onDone();
  };
  const toGrow = (): void => {
    onDone();
    pushOnce(GROW_NET);
  };

  return (
    <Sheet visible onDismiss={onDismiss}>
      <SheetScroll>
        <View style={styles.column}>
          <Text accessibilityRole="header" style={{ ...textRole(pairing, 'sheetTitle'), color: colors.ink }}>
            {t('decide.screens.safetyNet.firstAnswer.question')}
          </Text>
          <Text style={{ ...textRole(pairing, 'body'), color: colors.inkMuted }}>{t('decide.screens.safetyNet.firstAnswer.helper')}</Text>
          {starter !== null && starter > 0 ? (
            <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>
              {t('decide.v3.fact.net_none_start', { starter: fmt.formatMoney({ amount: minorUnits(starter), currency: currencyCode(currency) }) })}
            </Text>
          ) : null}
          <MoneyInput
            value={amount}
            currency={currency}
            onChange={setAmount}
            label={t('decide.screens.safetyNet.firstAnswer.amount')}
            accessibilityLabel={t('decide.screens.safetyNet.firstAnswer.amount')}
          />
          {otherCurrency ? (
            <Pill label={t('decide.screens.safetyNet.settings.changeSize')} variant="secondary" onPress={toGrow} />
          ) : (
            <Pill label={t('decide.screens.safetyNet.firstAnswer.save')} variant="primary" disabled={!ready} onPress={save} />
          )}
          <Pill label={t('decide.screens.safetyNet.firstAnswer.notSet')} variant="secondary" onPress={notSet} />
          <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>{t('decide.screens.safetyNet.firstAnswer.notSetNote')}</Text>
        </View>
      </SheetScroll>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  column: { gap: space.groupGap },
  offline: { flex: 1, justifyContent: 'center', paddingHorizontal: space.screenH },
});
