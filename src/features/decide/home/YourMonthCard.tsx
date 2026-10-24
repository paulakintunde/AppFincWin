/**
 * 05-27 (DCU-01, DCU-10, D-03, D-04, D-14): the dark "Your month" card on Decide home. Three states by source kind:
 * logged (the figures come from prepareContext only, never recomputed here), rough (the figures the user gave, with
 * Edit) and none (the empty state). The Worst / Average control appears only with 3 or more full months and writes
 * the per-user basis_override.
 *
 * 05-115 (D-99): the logged and rough content is `MonthDetailsBody`, shared with the Month details sheet. YourMonthCard
 * stays as the ink wrapper around it until 05-118 removes the card from the home.
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
import { Pill } from '@/ui/Pill';
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

export interface MonthDetailsBodyProps extends YourMonthCardProps {
  /** true on the ink card; false inside the Month details sheet (light surface, D-99). */
  dark?: boolean;
  /** Drawn first in the header row (the card's eyebrow). The sheet has its title instead. */
  eyebrow?: React.ReactNode;
  /** The Activity link; defaults to navigating to Activity. The sheet closes itself first. */
  onActivity?: () => void;
}

const goActivity = () => {
  router.navigate('/activity' as Href);
};

/**
 * D-99: what Your month showed inline, without the card chrome: the steadiness chip, the Activity link, the three
 * columns, the basis line and the Worst / Average control for a logged source; the columns and Edit for a rough one.
 * Renders nothing for the other sources (the card and the sheet each word those themselves).
 */
export function MonthDetailsBody({ source, userId, whole, onEditRough, dark = false, eyebrow, onActivity = goActivity }: MonthDetailsBodyProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const settingsMutation = useUpdateDecideSettings(userId ?? '');
  const basisInfo = useInfoSheet('basisMonth');

  const context = useMemo(() => {
    if (source === null || source.kind !== 'logged') return null;
    const result = prepareContext(source.snapshot);
    return result.ok ? result.context : null;
  }, [source]);

  // Rule S by label length (as SegmentedToggle): the Worst / Average labels carry an amount, and an equal segment at 402
  // holds about 16 characters, so a longer label stacks the control as the radio list.
  const basisLabels = useMemo(
    () =>
      context === null
        ? null
        : {
            worst: t('decide.month.worstChip', { amount: whole(context.money.incomeWorst) }),
            average: t('decide.month.averageChip', { amount: whole(context.money.incomeAverage) }),
          },
    [context, t, whole]
  );
  const stack = useShouldStack(basisLabels === null ? undefined : Math.max(basisLabels.worst.length, basisLabels.average.length));

  if (source === null) return null;

  const soft = dark ? colors.inkSoft2 : colors.inkMuted;
  const text = dark ? colors.surface : colors.ink;

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
      { key: 'worst', label: basisLabels?.worst ?? '' },
      { key: 'average', label: basisLabels?.average ?? '' },
    ] as const;
    // Selected: surface on the ink card, ink on the sheet. Unselected: a tint of the opposite colour (fill1 on the sheet).
    const selectedFill = dark ? colors.surface : colors.ink;
    const selectedText = dark ? colors.ink : colors.surface;
    const unselectedText = dark ? colors.inkSoft2 : colors.ink;

    return (
      <View style={styles.body}>
        <View style={styles.header}>
          {eyebrow ?? null}
          <StateChip tone={STEADINESS_TONE[m.steadiness]} label={steadinessLabel} />
          <View style={styles.spacer} />
          <ActionPill dark={dark} label={t('decide.month.activity')} onPress={onActivity} />
        </View>
        <FigureStrip
          dark={dark}
          items={[
            { caption: t('decide.month.in'), value: whole(m.incomeBasis) },
            { caption: t('decide.month.out'), value: whole(m.spendingBasis) },
            { caption: t('decide.month.left'), value: whole(left), tone: left < 0 ? 'negative' : 'neutral' },
          ]}
        />
        <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: soft }}>{basisLine}</Text>
        {fewMonths ? null : (
          <>
            <InfoLabel term={basisInfo.term} onInfo={basisInfo.open} tone={dark ? 'dark' : 'light'} lineHeight={LABEL_LINE}>
              <Text style={{ ...textRole(pairing, 'label'), color: soft }}>{t('decide.month.basisA11y')}</Text>
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
                      <Text style={{ ...textRole(pairing, 'label'), color: text, flexShrink: 1 }}>{option.label}</Text>
                    </Pressable>
                  );
                }
                const unselectedFill = dark ? 'transparent' : colors.fill1;
                return (
                  <Pressable
                    key={option.key}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: selected }}
                    accessibilityLabel={option.label}
                    onPress={choose}
                    style={[styles.segment, { backgroundColor: selected ? selectedFill : unselectedFill }]}
                  >
                    {selected || !dark ? null : (
                      <View
                        pointerEvents="none"
                        style={[StyleSheet.absoluteFill, { backgroundColor: colors.surface, opacity: SURFACE_ON_INK_OPACITY, borderRadius: radii.pill }]}
                      />
                    )}
                    <Text style={{ ...textRole(pairing, 'label'), color: selected ? selectedText : unselectedText }}>{option.label}</Text>
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
      <View style={styles.body}>
        <View style={styles.header}>
          {eyebrow ?? null}
          <View style={styles.spacer} />
          {dark ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('decide.month.editA11y')}
              onPress={onEditRough}
              style={({ pressed }) => [styles.edit, { opacity: pressed ? PRESSED_OPACITY : 1 }]}
            >
              <Text style={{ ...textRole(pairing, 'label'), color: colors.surface }}>{t('decide.month.edit')}</Text>
            </Pressable>
          ) : (
            <Pill label={t('decide.month.edit')} accessibilityLabel={t('decide.month.editA11y')} variant="secondary" onPress={onEditRough} />
          )}
        </View>
        <FigureStrip
          dark={dark}
          items={[
            { caption: t('decide.month.in'), value: whole(monthlyIncome) },
            { caption: t('decide.month.out'), value: whole(monthlySpending) },
            { caption: t('decide.month.left'), value: whole(left), tone: left < 0 ? 'negative' : 'neutral' },
          ]}
        />
      </View>
    );
  }

  return null;
}

export function YourMonthCard({ source, settings, userId, whole, onEditRough }: YourMonthCardProps) {
  const t = useT();
  const { colors, pairing } = useTheme();

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

  // ── logged / rough ──
  if (source.kind === 'logged' || source.kind === 'rough') {
    return (
      <View style={[styles.card, { backgroundColor: colors.ink }]} testID="your-month-card">
        <MonthDetailsBody
          source={source}
          settings={settings}
          userId={userId}
          whole={whole}
          onEditRough={onEditRough}
          dark
          eyebrow={eyebrow(source.kind === 'logged' ? t('decide.month.eyebrow') : t('decide.month.roughEyebrow'))}
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

/** The ink-card pill on the card; the shared secondary Pill on the light sheet. */
function ActionPill({ label, onPress, dark }: { label: string; onPress: () => void; dark: boolean }) {
  return dark ? <DarkPill label={label} onPress={onPress} /> : <Pill label={label} variant="secondary" onPress={onPress} />;
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
  body: { gap: space.gapMd },
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
