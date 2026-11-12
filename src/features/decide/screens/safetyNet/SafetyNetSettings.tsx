// 06.1-18 (D51, N07 locked, N07U unlocked, D-20): the one place Decide's answers are allowed to use the safety net. The net is
// Grow's flagged goal; this screen shows how much is in it, whether answers may use it, and switches that. Locking is immediate
// (a plain toast); unlocking is behind the D52 confirm (an outline button here, the accent Unlock only inside the confirm).
// decide_may_use is read defensively: absent means locked.
import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSavingsGoalRows } from '@/data/queries/growGoals';
import { useT } from '@/i18n';
import { usePastContext } from '@/features/decide/screens/past/data/usePastDecisions';
import { useGoalsRead } from '@/features/grow/goals/useGoalsRead';
import { goalPercent } from '@/features/grow/home/GoalRow';
import { useGoalMoney } from '@/features/grow/home/useGoalMoney';
import { pushOnce } from '@/shell/navigation/pushOnce';
import { DetailScreen } from '@/shell/screen/DetailScreen';
import { PRESSED_OPACITY, radii, space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { categorySwatch, shadows } from '@/theme/tokens';
import { textRole } from '@/theme/typography';
import { Pill } from '@/ui/Pill';
import { ProgressBar } from '@/ui/ProgressBar';
import { Text } from '@/ui/Text';
import { ToggleRow } from '@/ui/ToggleRow';
import { NetQuestionSheet } from '../firstAnswer/FirstAnswerGate';
import { LockGlyphAnimated } from '../motion/LockGlyphAnimated';
import type { NetAnswerPort, NetUsePort } from './ports';
import { UnlockConfirm } from './UnlockConfirm';

type Translate = (key: string, params?: Record<string, string | number>) => string;

const GROW_NET = '/grow/safety-net' as const;

export interface SafetyNetSettingsProps {
  /** The unlock/lock write and the first-answer net write, bound by src/shell/decide/SafetyNetRoute.tsx. */
  net: NetUsePort;
  answer: NetAnswerPort;
}

export function SafetyNetSettings({ net, answer }: SafetyNetSettingsProps): React.JSX.Element {
  const t = useT() as unknown as Translate;
  const { colors, pairing } = useTheme();
  const { userId, householdId } = usePastContext();
  const money = useGoalMoney();
  const read = useGoalsRead();
  const rowsQ = useSavingsGoalRows(userId ?? undefined, householdId ?? undefined);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [questionOpen, setQuestionOpen] = useState(false);

  const row = rowsQ.data?.find((r) => r.is_safety_net === true && r.deleted_at === null) ?? null;
  const point = read.model.safetyNet;
  const size = point !== null && point.size !== null && point.size > 0 ? point.size : null;
  const saved = point === null ? 0 : point.saved;
  const locked = row?.decide_may_use !== true;

  const lock = (): void => {
    if (row === null || userId === null) return;
    net.mutate({ goal: row, on: false, ownerId: userId });
  };
  const onSwitch = (nextLocked: boolean): void => {
    if (nextLocked) lock();
    else setConfirmOpen(true);
  };

  const card = [styles.card, { backgroundColor: colors.surface }, shadows.card];
  const title = t('decide.screens.safetyNet.settings.title');

  if (row === null) {
    return (
      <DetailScreen title={title}>
        <View testID="net-settings-empty" style={[...card, styles.center]}>
          <Text accessibilityRole="header" style={{ ...textRole(pairing, 'sheetTitle'), color: colors.ink, textAlign: 'center' }}>
            {t('decide.screens.safetyNet.settings.emptyTitle')}
          </Text>
          <Text style={{ ...textRole(pairing, 'body'), color: colors.inkMuted, textAlign: 'center' }}>{t('decide.screens.safetyNet.settings.emptyBody')}</Text>
          <Pill label={t('decide.screens.safetyNet.settings.setAmount')} variant="primary" onPress={() => setQuestionOpen(true)} />
        </View>
        <NetQuestionSheet answer={answer} visible={questionOpen} onDone={() => setQuestionOpen(false)} onDismiss={() => setQuestionOpen(false)} />
      </DetailScreen>
    );
  }

  const word = locked ? t('decide.screens.safetyNet.settings.locked') : t('decide.screens.safetyNet.settings.unlocked');
  const tileA11y = locked ? t('decide.screens.safetyNet.settings.tileLockedA11y') : t('decide.screens.safetyNet.settings.tileUnlockedA11y');

  return (
    <DetailScreen title={title}>
      <View style={styles.stack}>
        <Text style={{ ...textRole(pairing, 'body'), color: colors.inkMuted }}>{t('decide.screens.safetyNet.settings.sub')}</Text>
        <View style={[...card, styles.figureCard]}>
          <View style={styles.tileRow}>
            <View
              testID="net-tile"
              accessible
              accessibilityLabel={tileA11y}
              style={[styles.tile, { backgroundColor: categorySwatch.blue.tint }]}
            >
              <LockGlyphAnimated locked={locked} color={categorySwatch.blue.color} />
            </View>
            <View style={styles.tileText}>
              <Text testID="net-word" style={{ ...textRole(pairing, 'sheetTitle'), color: colors.ink }}>
                {word}
              </Text>
              <Text style={{ ...textRole(pairing, 'body'), color: colors.inkMuted }}>
                {t('decide.screens.safetyNet.settings.inNow', { amount: money.amount(saved) })}
              </Text>
            </View>
          </View>
          {size !== null ? (
            <>
              <ProgressBar percent={goalPercent(saved, size)} variant="thick" tone="blue" accessibilityLabel={`${goalPercent(saved, size)}%`} />
              <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>
                {t('decide.screens.safetyNet.settings.legend', { amount: money.amount(saved), size: money.amount(size) })}
              </Text>
            </>
          ) : null}
        </View>

        <View style={card}>
          <ToggleRow label={t('decide.screens.safetyNet.settings.lockSwitch')} value={locked} onChange={onSwitch} />
          <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>{t('decide.screens.safetyNet.settings.lockSub')}</Text>
        </View>

        {locked ? (
          <View style={[styles.card, styles.before, { borderColor: colors.line2 }]}>
            <Text accessibilityRole="header" style={{ ...textRole(pairing, 'sheetTitle'), color: colors.ink }}>
              {t('decide.screens.safetyNet.settings.beforeTitle')}
            </Text>
            <Text style={{ ...textRole(pairing, 'body'), color: colors.ink }}>{t('decide.screens.safetyNet.settings.beforeBody')}</Text>
            <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>{t('decide.screens.safetyNet.settings.beforeLockAgain')}</Text>
            <OutlineButton label={t('decide.screens.safetyNet.settings.unlock')} onPress={() => setConfirmOpen(true)} />
          </View>
        ) : (
          <Pill label={t('decide.screens.safetyNet.settings.lockAgain')} variant="secondary" onPress={lock} />
        )}

        <Pressable
          accessibilityRole="link"
          accessibilityLabel={t('decide.screens.safetyNet.settings.changeSize')}
          onPress={() => pushOnce(GROW_NET)}
          style={({ pressed }) => [styles.link, { opacity: pressed ? PRESSED_OPACITY : 1 }]}
        >
          <Text style={{ ...textRole(pairing, 'label'), color: colors.ink, textDecorationLine: 'underline' }}>
            {t('decide.screens.safetyNet.settings.changeSize')}
          </Text>
        </Pressable>
      </View>
      <UnlockConfirm
        visible={confirmOpen}
        goal={row}
        ownerId={userId}
        net={net}
        amountText={money.amount(size ?? saved)}
        onClose={() => setConfirmOpen(false)}
      />
    </DetailScreen>
  );
}

/** D-20: "Unlock for answers" is an outline control, never the accent fill: it lowers a protection. */
function OutlineButton({ label, onPress }: { label: string; onPress: () => void }): React.JSX.Element {
  const { colors, pairing } = useTheme();
  return (
    <Pressable
      testID="net-unlock-button"
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.outline, { borderColor: colors.ink, opacity: pressed ? PRESSED_OPACITY : 1 }]}
    >
      <Text style={{ ...textRole(pairing, 'label'), color: colors.ink }}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  stack: { gap: space.groupGap, paddingTop: space.gapMd },
  card: { borderRadius: radii.card, padding: space.cardPad, gap: space.gapMd },
  center: { alignItems: 'center' },
  figureCard: { gap: space.gapMd },
  tileRow: { flexDirection: 'row', alignItems: 'center', gap: space.gapMd },
  tile: { width: 48, aspectRatio: 1, borderRadius: radii.card, alignItems: 'center', justifyContent: 'center' },
  tileText: { flex: 1, gap: 2 },
  before: { borderWidth: 1 },
  outline: {
    minHeight: space.touchMin,
    borderRadius: radii.pill,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.cardPad,
  },
  link: { minHeight: space.touchMin, justifyContent: 'center' },
});
