// 06.1-14 (CO-D-64 (4), CO-D-119, UX-01, UX-29): the one answer layout every N board and D20/D21 uses. Reading order, for the eye and the
// screen reader alike: top bar, notices (unsaved first, only when sent), verdict card, fact lines, options, the "More detail" slot, basis
// sentence, first caveat only, caveat line, "What this can't see", footer, and last the action bar. Pure composition; nothing is written.
import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import type { Evaluation, LocalDate, Purpose, YearMonth } from '@/engine/decide/v3';
import { money as makeMoney } from '@/engine/money';
import { space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { textRole } from '@/theme/typography';
import { useMoneyFormatter } from '@/ui/money/useMoneyFormatter';
import { Text } from '@/ui/Text';
import { ActionBar } from './ActionBar';
import { AnswerTopBar, type AnswerTopBarProps, type PayMode, type WhenChoice } from './AnswerTopBar';
import { FactLines } from './FactLines';
import type { ReadinessFixRow, WaiverChoice } from '../logic/readinessFixes';
import type { Line } from '../logic/sayResult';
import { LegalBlock } from './LegalBlock';
import { OptionChips, type OptionKey } from './OptionChips';
import { ErrorCard, NotReadyCard, OfflineCard } from './StatusCards';
import { VerdictCard } from './VerdictCard';
import { useSaid, type UseSaidOptions } from './useSaid';

export type AnswerAction =
  | { kind: 'back' }
  | { kind: 'newCheck' }
  | { kind: 'pay'; mode: PayMode }
  | { kind: 'when'; when: WhenChoice }
  | { kind: 'bought' }
  | { kind: 'saveFor' }
  | { kind: 'notBuying' }
  | { kind: 'retry' }
  | { kind: 'finishSetup' }
  | { kind: 'fromEstimates' };

/** What the frame needs to know about the check, already written for the screen. */
export interface AnswerCheckView {
  name: string;
  priceText: string;
  pay: PayMode;
  when: WhenChoice;
  dateText?: string | null;
  purpose: Purpose | null;
  /** The options present for this check (cheaper only with a cheaper price, installments only on a cash check). */
  options: readonly OptionKey[];
  /** V3Inputs.region, for the free-help link. */
  country?: string | null;
}

export interface AnswerFrameProps {
  check: AnswerCheckView;
  evaluation: Evaluation | null;
  status?: 'loading' | 'error' | 'ready';
  /** Set when the device is offline: the date the records run up to, as written. */
  offlineDate?: string | null;
  said: UseSaidOptions;
  onAction: (action: AnswerAction) => void;
  onOption: (key: OptionKey) => void;
  onCantSee: () => void;
  /** 06.1-23: extra content under a fact or missing line (factAction buttons, Fix links). */
  renderAfterFact?: (line: Line, index: number) => React.ReactNode;
  /** The "More detail" rows (plan 23). */
  children?: React.ReactNode;
  /** 06.1-44 (G-1, C-2): the named readiness items for the not-ready card (readinessFixRows). Absent = none named. */
  readinessRows?: readonly ReadinessFixRow[];
  /** D-57 (C-1): true only while quick estimates can count (estimatesCanAnswer). Absent = false: no quick-estimates control. */
  canUseEstimates?: boolean;
  onReadinessFix?: (row: ReadinessFixRow) => void;
  onReadinessChoice?: (row: ReadinessFixRow, choice: WaiverChoice) => void;
}

const NO_ROWS: readonly ReadinessFixRow[] = [];

/** "November" for 2026-11, in the device locale (the same words YourMonthCard uses). */
function monthNameIn(locale: string): (ym: YearMonth) => string {
  return (ym) => new Intl.DateTimeFormat(locale, { month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 1, 1)));
}

export function AnswerFrame({
  check,
  evaluation,
  status = 'ready',
  offlineDate = null,
  said,
  onAction,
  onOption,
  onCantSee,
  renderAfterFact,
  children,
  readinessRows = NO_ROWS,
  canUseEstimates = false,
  onReadinessFix,
  onReadinessChoice,
}: AnswerFrameProps) {
  const { colors, pairing } = useTheme();
  const fmt = useMoneyFormatter(said.showCents ?? true, said.currency);
  const result = status === 'ready' ? (evaluation?.result ?? null) : null;
  const lines = useSaid(result, said);

  const top: AnswerTopBarProps = {
    name: check.name,
    priceText: check.priceText,
    pay: check.pay,
    when: check.when,
    dateText: check.dateText ?? null,
    onBack: () => onAction({ kind: 'back' }),
    onNewCheck: () => onAction({ kind: 'newCheck' }),
    onPay: (mode) => onAction({ kind: 'pay', mode }),
    onWhen: (when) => onAction({ kind: 'when', when }),
  };
  const retry = (): void => onAction({ kind: 'retry' });

  let body: React.ReactNode = null;
  let showActions = false;
  if (status === 'error') {
    body = <ErrorCard item={check.name} onRetry={retry} />;
  } else if (result !== null && result.readiness?.ready === false) {
    // D-52: a not-ready result is never a verdict.
    // 06.1-44 (C-1): quick estimates only when they can count; otherwise the card names each item with its fix and answers.
    body = (
      <NotReadyCard
        rows={readinessRows}
        canUseEstimates={canUseEstimates}
        asOf={said.today as LocalDate}
        money={(minor) => fmt.formatMoney(makeMoney(minor, said.currency))}
        date={(d) => fmt.formatDate(d)}
        monthName={monthNameIn(fmt.locale)}
        onFix={(row) => onReadinessFix?.(row)}
        onChoice={(row, choice) => onReadinessChoice?.(row, choice)}
        onFinishSetup={() => onAction({ kind: 'finishSetup' })}
        onFromEstimates={() => onAction({ kind: 'fromEstimates' })}
      />
    );
  } else if (result !== null) {
    // D-68: a short plan judged by cash reads the one-off rows, like a payment made once.
    const once = check.pay === 'cash' || result.facts.some((f) => f.code === 'short_plan_from_cash');
    showActions = true;
    body = (
      <>
        {lines.notices.length > 0 ? (
          <View testID="answer-notices" style={styles.group}>
            {lines.notices.map((n, i) => (
              <Text key={`${n.code}-${i}`} testID={`answer-notice-${n.code}`} style={{ ...textRole(pairing, 'label'), color: colors.inkDim }}>
                {n.text}
              </Text>
            ))}
          </View>
        ) : null}
        <VerdictCard code={result.code} variant={result.variant} once={once} values={lines.verdictValues} lead={lines.afterBuy.lead?.text ?? null} boughtOn={lines.afterBuy.boughtOn?.text ?? null} />
        <FactLines facts={[...lines.facts, ...lines.missing]} country={check.country ?? null} renderAfter={renderAfterFact} />
        <OptionChips present={check.options} purpose={check.purpose} onOption={onOption} />
        {children !== undefined ? (
          <View testID="answer-detail" style={styles.group}>
            {children}
          </View>
        ) : null}
        <LegalBlock basis={lines.basis} caveat={lines.caveat} caveatFigures={lines.caveatFigures} onCantSee={onCantSee} />
      </>
    );
  }

  return (
    <View testID="answer-frame" style={[styles.frame, { backgroundColor: colors.canvas }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <AnswerTopBar {...top} />
        {offlineDate !== null ? <OfflineCard date={offlineDate} onRetry={retry} /> : null}
        {body}
      </ScrollView>
      {showActions ? (
        <ActionBar onBought={() => onAction({ kind: 'bought' })} onSaveFor={() => onAction({ kind: 'saveFor' })} onNotBuying={() => onAction({ kind: 'notBuying' })} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { flex: 1 },
  content: { padding: space.screenH, gap: space.groupGap },
  group: { gap: space.gapSm },
});
