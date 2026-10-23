/**
 * 05-27 (DCU-01, DCU-10, D-03, D-04, D-14): the dark "Your month" card on Decide home. Three states by source kind:
 * logged (the figures come from prepareContext only, never recomputed here), rough (the figures the user gave, with
 * Edit) and none (the empty state). The Worst / Average control appears only with 3 or more full months and writes
 * the per-user basis_override.
 */
import React, { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { useUpdateDecideSettings } from '@/data/mutations/decideSettings';
import type { DecideSettingsRow } from '@/db/decideSettings';
import { prepareContext, type MoneyBasis } from '@/engine/decide';
import { useT } from '@/i18n';
import { pushOnce } from '@/shell/navigation/pushOnce';
import { PRESSED_OPACITY, radii, space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { fontSize, textRole } from '@/theme/typography';
import { Text } from '@/ui/Text';
import { hapticSelection } from '@/ui/haptics';
import { RadioDot } from '@/ui/RadioDot';
import { STEADINESS_LABEL } from '../copy/codeMaps';
import { missingRateCopy } from '../copy/verdictCopy';
import { refText, type Translate } from '../check/refText';
import { FigureStrip } from '../ui/FigureStrip';
import { InfoLabel } from '../ui/InfoLabel';
import { useInfoSheet } from '../ui/useInfoSheet';
import { useShouldStack } from '../ui/textFit';
import { StateChip, type StateChipTone } from '../ui/StateChip';
import type { Money } from '../check/steps/stepUi';
import type { SnapshotResult } from '../snapshot/types';

export interface YourMonthCardProps {
  source: SnapshotResult | null;
  settings: DecideSettingsRow | null;
  userId: string | null;
  whole: Money;
  /** Opens the shared RoughFiguresSheet (rendered once by the screen). */
  onEditRough: () => void;
}

const MIN_FULL_MONTHS_FOR_STEADINESS = 3; // 04 D-12 / D-08
const STEADINESS_TONE: Record<MoneyBasis['steadiness'], StateChipTone> = {
  steady: 'fits',
  variable: 'adjust',
  volatile: 'no',
  insufficient: 'draft',
};
const LABEL_LINE = 18; // the label role's line height, to centre the glyph on the first line
const SURFACE_ON_INK_OPACITY = 0.12; // UI-SPEC Color: surface at .12 over the ink card

export function YourMonthCard({ source, settings, userId, whole, onEditRough }: YourMonthCardProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const settingsMutation = useUpdateDecideSettings(userId ?? '');
  const stack = useShouldStack();
  const basisInfo = useInfoSheet('basisMonth');

  const context = useMemo(() => {
    if (source === null || source.kind !== 'logged') return null;
    const result = prepareContext(source.snapshot);
    return result.ok ? result.context : null;
  }, [source]);

  if (source === null) return null;

  const eyebrow = (text: string) => (
    <Text
      style={{ ...textRole(pairing, 'label'), fontSize: fontSize.eyebrow, color: colors.inkSoft1, textTransform: 'uppercase', letterSpacing: 1.2 }}
    >
      {text}
    </Text>
  );

  // ── D-37: a needed rate is missing, so no figure is shown on this card ──
  if (source.unconverted !== null) {
    const missing = missingRateCopy(source.unconverted);
    const tr = t as Translate;
    return (
      <View style={[styles.card, { backgroundColor: colors.ink }]} testID="your-month-card">
        {eyebrow(t('decide.month.eyebrow'))}
        <Text accessibilityRole="header" style={{ ...textRole(pairing, 'sheetTitle'), color: colors.surface }}>
          {refText(tr, missing.title)}
        </Text>
        <Text style={{ ...textRole(pairing, 'body'), color: colors.inkSoft1 }}>{refText(tr, missing.body)}</Text>
      </View>
    );
  }

  // ── logged ──
  if (source.kind === 'logged') {
    if (context === null) return null;
    const m = context.money;
    const fewMonths = m.fullMonthsUsed < MIN_FULL_MONTHS_FOR_STEADINESS;
    let basisLine: string;
    if (fewMonths) {
      basisLine = t('decide.month.fewLine');
    } else if (m.incomeAverage === 0) {
      basisLine = t('decide.month.noIncomeLine', { count: m.fullMonthsUsed });
    } else if (m.steadiness === 'steady' && m.incomeCvPercent !== null) {
      basisLine = t('decide.month.steadyLine', { count: m.fullMonthsUsed, pct: `${m.incomeCvPercent}%` });
    } else {
      basisLine = t('decide.month.variableLine', {
        count: m.fullMonthsUsed,
        worst: whole(m.incomeWorst),
        best: whole(m.incomeBest),
      });
    }
    const left = context.leftBefore;
    const steadinessLabel = t(STEADINESS_LABEL[m.steadiness]);
    const options = [
      { key: 'worst', label: t('decide.month.worstChip', { amount: whole(m.incomeWorst) }) },
      { key: 'average', label: t('decide.month.averageChip', { amount: whole(m.incomeAverage) }) },
    ] as const;

    return (
      <View style={[styles.card, { backgroundColor: colors.ink }]} testID="your-month-card">
        <View style={styles.header}>
          {eyebrow(t('decide.month.eyebrow'))}
          <StateChip tone={STEADINESS_TONE[m.steadiness]} label={steadinessLabel} />
          <View style={styles.spacer} />
          <DarkPill
            label={t('decide.month.activity')}
            onPress={() => {
              router.navigate('/activity' as Href);
            }}
          />
        </View>
        <FigureStrip
          dark
          items={[
            { caption: t('decide.month.in'), value: whole(m.incomeBasis) },
            { caption: t('decide.month.out'), value: whole(m.spendingBasis) },
            { caption: t('decide.month.left'), value: whole(left), tone: left < 0 ? 'negative' : 'neutral' },
          ]}
        />
        <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkSoft2 }}>{basisLine}</Text>
        {fewMonths ? null : (
          <>
            <InfoLabel term={basisInfo.term} onInfo={basisInfo.open} tone="dark" lineHeight={LABEL_LINE}>
              <Text style={{ ...textRole(pairing, 'label'), color: colors.inkSoft2 }}>{t('decide.month.basisA11y')}</Text>
            </InfoLabel>
            <View
              accessibilityRole="radiogroup"
              accessibilityLabel={t('decide.month.basisA11y')}
              style={stack ? styles.basisStack : styles.basis}
            >
              {options.map((option) => {
                const selected = m.basis === option.key;
                const choose = () => {
                  if (selected || userId === null) return;
                  hapticSelection();
                  settingsMutation.update({ basis_override: option.key });
                };
                if (stack) {
                  return (
                    <Pressable
                      key={option.key}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: selected }}
                      accessibilityLabel={option.label}
                      onPress={choose}
                      style={styles.radioRow}
                    >
                      <RadioDot selected={selected} />
                      <Text style={{ ...textRole(pairing, 'label'), color: colors.surface, flexShrink: 1 }}>{option.label}</Text>
                    </Pressable>
                  );
                }
                return (
                  <Pressable
                    key={option.key}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: selected }}
                    accessibilityLabel={option.label}
                    onPress={choose}
                    style={[styles.segment, { backgroundColor: selected ? colors.surface : 'transparent' }]}
                  >
                    {selected ? null : (
                      <View
                        pointerEvents="none"
                        style={[StyleSheet.absoluteFill, { backgroundColor: colors.surface, opacity: SURFACE_ON_INK_OPACITY, borderRadius: radii.pill }]}
                      />
                    )}
                    <Text style={{ ...textRole(pairing, 'label'), color: selected ? colors.ink : colors.inkSoft2 }}>{option.label}</Text>
                  </Pressable>
                );
              })}
            </View>
            {basisInfo.sheet}
          </>
        )}
      </View>
    );
  }

  // ── rough ──
  if (source.kind === 'rough') {
    const { monthlyIncome, monthlySpending } = source.figures;
    const left = monthlyIncome - monthlySpending;
    return (
      <View style={[styles.card, { backgroundColor: colors.ink }]} testID="your-month-card">
        <View style={styles.header}>
          {eyebrow(t('decide.month.roughEyebrow'))}
          <View style={styles.spacer} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('decide.month.editA11y')}
            onPress={onEditRough}
            style={({ pressed }) => [styles.edit, { opacity: pressed ? PRESSED_OPACITY : 1 }]}
          >
            <Text style={{ ...textRole(pairing, 'label'), color: colors.surface }}>{t('decide.month.edit')}</Text>
          </Pressable>
        </View>
        <FigureStrip
          dark
          items={[
            { caption: t('decide.month.in'), value: whole(monthlyIncome) },
            { caption: t('decide.month.out'), value: whole(monthlySpending) },
            { caption: t('decide.month.left'), value: whole(left), tone: left < 0 ? 'negative' : 'neutral' },
          ]}
        />
      </View>
    );
  }

  // ── none ──
  return (
    <View style={[styles.card, { backgroundColor: colors.ink }]} testID="your-month-card">
      {eyebrow(t('decide.month.eyebrow'))}
      <Text accessibilityRole="header" style={{ ...textRole(pairing, 'sheetTitle'), color: colors.surface }}>
        {t('decide.home.noFigures.heading')}
      </Text>
      <Text style={{ ...textRole(pairing, 'body'), color: colors.inkSoft1 }}>{t('decide.home.noFigures.body')}</Text>
      <View style={styles.actions}>
        <DarkPill label={t('decide.home.noFigures.addRough')} selected onPress={onEditRough} />
        <DarkPill label={t('decide.home.noFigures.import')} onPress={() => pushOnce('/import' as Href)} />
      </View>
    </View>
  );
}

function DarkPill({ label, onPress, selected = false }: { label: string; onPress: () => void; selected?: boolean }) {
  const { colors, pairing } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.pill, { backgroundColor: selected ? colors.surface : 'transparent', opacity: pressed ? PRESSED_OPACITY : 1 }]}
    >
      {selected ? null : (
        <View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { backgroundColor: colors.surface, opacity: SURFACE_ON_INK_OPACITY, borderRadius: radii.pill }]}
        />
      )}
      <Text style={{ ...textRole(pairing, 'label'), color: selected ? colors.ink : colors.surface }}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radii.card, padding: space.cardPadLg, gap: space.gapMd },
  header: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space.gapSm },
  spacer: { flex: 1 },
  edit: { minHeight: space.touchMin, minWidth: space.touchMin, justifyContent: 'center', alignItems: 'center' },
  pill: {
    minHeight: space.touchMin,
    paddingHorizontal: space.cardPad,
    borderRadius: radii.pill,
    justifyContent: 'center',
    alignItems: 'center',
  },
  basis: { flexDirection: 'row', gap: space.gapSm },
  basisStack: { gap: 0 },
  radioRow: { minHeight: space.touchMin, flexDirection: 'row', alignItems: 'center', gap: space.gapMd },
  segment: {
    flex: 1,
    minHeight: space.touchMin,
    borderRadius: radii.pill,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.gapSm },
});
