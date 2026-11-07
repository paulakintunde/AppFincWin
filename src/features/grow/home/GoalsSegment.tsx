// 06-15 (G01): the Goals segment. Hero (saved across goals), the safety net card first, goal rows, "+ New goal".
// Everything is read through useGoalsRead (06-12), the same connection points Decide uses, so the figures match Decide's.
// `basics` draws only the safety net card (level Basics: goals off). Loading is grey blocks with no loop; an error is the
// generic card with Try again.
import React, { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useDecideSettings } from '@/data/queries/decide';
import { currencyCode, minorUnits } from '@/engine/money';
import { goalPlanByMonthly } from '@/engine/grow';
import { useT } from '@/i18n';
import { useCalcFormat } from '@/features/grow/calculators/typed/CalcFields';
import { firstOfNextMonth } from '@/features/grow/calculators/typed/useCalcInput';
import { useGoalsRead } from '@/features/grow/goals/useGoalsRead';
import { GrowGlyph } from '@/features/grow/ui/GrowGlyph';
import { Pill } from '@/ui/Pill';
import { Text } from '@/ui/Text';
import { radii, space } from '@/theme/layout';
import { shadows } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';
import { fontSize, textRole } from '@/theme/typography';
import { useMoneyFormatter } from '@/ui/money/useMoneyFormatter';
import { GoalRow, type GoalRowMoney } from './GoalRow';
import { SafetyNetCard } from './SafetyNetCard';

export interface GoalsSegmentProps {
  /** Level Basics: only the safety net card. */
  basics?: boolean;
  /** FAB and "+ New goal": plan 06-22 mounts the sheet this opens. */
  onNewGoal: () => void;
  /** Basics only: "Choose what to track". */
  onChooseTrack?: () => void;
}

const MONTH_SPOKEN = { month: 'long', year: 'numeric', timeZone: 'UTC' } as const;

export function useGoalMoney(): GoalRowMoney {
  const calc = useCalcFormat();
  const whole = useMoneyFormatter(false, calc.currency);
  return useMemo(() => {
    const cur = currencyCode(calc.currency);
    return {
      amount: (minor) => whole.formatMoney({ amount: minorUnits(minor), currency: cur }),
      spoken: (minor) => whole.formatMoneyA11y({ amount: minorUnits(minor), currency: cur }),
      monthYear: calc.monthYear,
      monthYearLong: (date) => {
        const [y, m] = date.split('-').map(Number);
        return new Intl.DateTimeFormat(whole.locale, MONTH_SPOKEN).format(Date.UTC(y!, m! - 1, 1));
      },
    };
  }, [calc, whole]);
}

export function GoalsSegment({ basics = false, onNewGoal, onChooseTrack }: GoalsSegmentProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const read = useGoalsRead();
  const money = useGoalMoney();
  const settings = useDecideSettings(read.userId ?? undefined).data ?? null;
  const rule = settings === null ? null : settings.saving_floor;
  const card = [styles.card, { backgroundColor: colors.surface }, shadows.card];

  if (read.status === 'loading') {
    return (
      <View testID="grow-goals-loading" accessibilityLabel={t('grow.home.loading')} style={styles.stack}>
        <View style={[styles.block, { height: 96, backgroundColor: colors.fill1 }]} />
        <View style={[styles.block, { height: 112, backgroundColor: colors.fill1 }]} />
        <View style={[styles.block, { height: 128, backgroundColor: colors.fill1 }]} />
      </View>
    );
  }
  if (read.status === 'error') {
    return (
      <View testID="grow-goals-error" style={[...card, styles.center]}>
        <Text style={{ ...textRole(pairing, 'body'), color: colors.ink, textAlign: 'center' }}>{t('grow.common.loadErrorTitle')}</Text>
        <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted, textAlign: 'center' }}>{t('grow.common.loadErrorBody')}</Text>
        <Pill label={t('grow.common.tryAgain')} variant="secondary" onPress={read.refetch} />
      </View>
    );
  }

  const { model } = read;
  const net = <SafetyNetCard net={model.safetyNet} money={money} />;
  if (basics) {
    return (
      <View style={styles.stack}>
        {net}
        <View testID="grow-basics-card" style={[...card, styles.center]}>
          <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted, textAlign: 'center' }}>{t('grow.home.basicsBody')}</Text>
          <Pill label={t('grow.home.basicsButton')} variant="secondary" onPress={onChooseTrack} />
        </View>
      </View>
    );
  }

  const count = model.goals.length + (model.safetyNet === null ? 0 : 1);
  const anchor = firstOfNextMonth(read.today);
  const reaches = (saved: number, target: number | null, add: number | null): string | null => {
    if (target === null || add === null || add <= 0 || saved >= target) return null;
    return goalPlanByMonthly({ have: minorUnits(saved), target: minorUnits(target), add: minorUnits(add), anchor }).reachesOn;
  };

  return (
    <View style={styles.stack}>
      <View testID="grow-goals-hero" style={card}>
        <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>{t('grow.home.goalsHeroLabel', { count })}</Text>
        <Text scale="capped" style={{ ...textRole(pairing, 'display'), color: colors.ink }}>
          {money.amount(model.totalSaved)}
        </Text>
        <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>
          {rule === null
            ? t('grow.home.goalsHeroNoteNoRule', { amount: money.amount(model.monthlyIntoGoals) })
            : t('grow.home.goalsHeroNote', { amount: money.amount(model.monthlyIntoGoals), rule: money.amount(rule) })}
        </Text>
      </View>
      {net}
      <Text accessibilityRole="header" style={{ ...textRole(pairing, 'label'), fontSize: fontSize.eyebrow, color: colors.inkMuted }}>
        {t('grow.home.goalsSection')}
      </Text>
      {model.goals.length === 0 ? (
        <View testID="grow-goals-empty" style={[...card, styles.center]}>
          <GrowGlyph name="savings" color={colors.accent} size={28} />
          <Text style={{ ...textRole(pairing, 'body'), color: colors.ink, textAlign: 'center' }}>{t('grow.goals.emptyTitle')}</Text>
          <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted, textAlign: 'center' }}>{t('grow.goals.emptyBody')}</Text>
          <Pill label={t('grow.goals.emptyAction')} variant="primary" onPress={onNewGoal} />
        </View>
      ) : (
        <View style={card}>
          {model.goals.map((g) => (
            <GoalRow key={g.id} goal={g} reachesOn={reaches(g.saved, g.target, g.monthlyAmount)} money={money} />
          ))}
          <Pressable accessibilityRole="button" accessibilityLabel={t('grow.home.newGoal')} onPress={onNewGoal} style={styles.newGoal}>
            <Text style={{ ...textRole(pairing, 'body'), color: colors.accent }}>{t('grow.home.newGoal')}</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: space.groupGap },
  card: { borderRadius: radii.card, paddingHorizontal: space.cardPad, paddingVertical: space.cardPad, gap: space.gapSm },
  center: { alignItems: 'center' },
  block: { borderRadius: radii.card },
  newGoal: { minHeight: space.touchMin, justifyContent: 'center' },
});
