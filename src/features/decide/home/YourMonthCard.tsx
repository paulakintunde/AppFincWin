/**
 * 05-27 (DCU-01, DCU-10, D-03, D-04, D-14): the dark "Your month" card on Decide home. Three states by source kind:
 * logged (the figures come from prepareContext only, never recomputed here), rough (the figures the user gave, with
 * Edit) and none (the empty state). The Worst / Average control appears only with 3 or more full months and writes
 * the per-user basis_override.
 *
 * 05-115 (D-99): the logged and rough content is `MonthDetailsBody`, shared with the Month details sheet. 05-118 removed
 * the ink YourMonthCard wrapper; only the body and its props type remain.
 */
import React, { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { useUpdateDecideSettings } from '@/data/mutations/decideSettings';
import type { DecideSettingsRow } from '@/db/decideSettings';
import { prepareContext, type MoneyBasis } from '@/engine/decide';
import { monthBreakdown, type MonthBreakdown } from './homeCardModel';
import { useT } from '@/i18n';
import { PRESSED_OPACITY, radii, space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { fontSize, textRole } from '@/theme/typography';
import { Pill } from '@/ui/Pill';
import { Text } from '@/ui/Text';
import { hapticSelection } from '@/ui/haptics';
import { RadioDot } from '@/ui/RadioDot';
import { STEADINESS_LABEL } from '../copy/codeMaps';
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
  /** The same amounts as a screen reader speaks them (formatMoneyA11y); falls back to `whole`. */
  wholeA11y?: Money;
  /** The local date the pots' set-asides are worked out from on a rough source (R18.1). */
  today: string;
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
  /** The "Pots ›" link under the breakdown (D-101): the sheet closes itself, then pushes the Pots route. Omitted = no link. */
  onPots?: () => void;
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
export function MonthDetailsBody({
  source,
  userId,
  whole,
  wholeA11y,
  today,
  onEditRough,
  onPots,
  dark = false,
  eyebrow,
  onActivity = goActivity,
}: MonthDetailsBodyProps) {
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
    const breakdown = monthBreakdown(source, today);
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
        {breakdown === null ? null : <Breakdown b={breakdown} whole={whole} wholeA11y={wholeA11y ?? whole} dark={dark} onPots={onPots} />}
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
    const breakdown = monthBreakdown(source, today);
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
        {breakdown === null ? null : <Breakdown b={breakdown} whole={whole} wholeA11y={wholeA11y ?? whole} dark={dark} onPots={onPots} />}
      </View>
    );
  }

  return null;
}

const MINUS = '−'; // a true minus for deductions (R18.1)

/**
 * D-100 / R18.1: the stacked breakdown that adds up to the hero. Rows with nothing in them hide (debts, saving and pots at
 * 0), the result never does. A negative result reads in danger, and its a11y label says "short by". The "Pots ›" link is
 * always shown (D-101): it is the way in for a user with no pots yet.
 */
function Breakdown({ b, whole, wholeA11y, dark, onPots }: { b: MonthBreakdown; whole: Money; wholeA11y: Money; dark: boolean; onPots?: () => void }) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const potsInfo = useInfoSheet('pots');
  const ink = dark ? colors.surface : colors.ink;
  const soft = dark ? colors.inkSoft2 : colors.inkMuted;
  const label = textRole(pairing, 'label');
  const rows: { key: string; caption: string; amount: number; sign: '' | typeof MINUS; info?: boolean }[] = [
    { key: 'in', caption: t('decide.home.monthDetails.in'), amount: b.income, sign: '' },
    { key: 'spending', caption: t('decide.home.monthDetails.spending'), amount: b.spending, sign: MINUS },
  ];
  if (b.debts !== 0) rows.push({ key: 'debts', caption: t('decide.home.monthDetails.debts'), amount: b.debts, sign: MINUS });
  if (b.saving !== 0) rows.push({ key: 'saving', caption: t('decide.home.monthDetails.saving'), amount: b.saving, sign: MINUS });
  if (b.setAside !== 0) rows.push({ key: 'pots', caption: t('decide.home.monthDetails.pots'), amount: b.setAside, sign: MINUS, info: true });
  const short = b.result < 0;
  const resultCaption = t('decide.home.monthDetails.result');
  const resultValue = `${short ? MINUS : ''}${whole(short ? -b.result : b.result)}`;
  return (
    <View style={styles.breakdown}>
      {rows.map((r) => {
        const caption = <Text style={{ ...label, color: soft, flexShrink: 1 }}>{r.caption}</Text>;
        return (
          <View
            key={r.key}
            accessible
            accessibilityLabel={t('decide.home.monthDetails.rowA11y', { label: r.caption, value: wholeA11y(r.amount) })}
            style={styles.breakdownRow}
          >
            {r.info ? (
              <InfoLabel term={potsInfo.term} onInfo={potsInfo.open} tone={dark ? 'dark' : 'light'} lineHeight={LABEL_LINE}>
                {caption}
              </InfoLabel>
            ) : (
              caption
            )}
            <Text style={{ ...label, color: ink }}>{`${r.sign}${whole(r.amount)}`}</Text>
          </View>
        );
      })}
      <View
        accessible
        accessibilityLabel={
          short
            ? t('decide.home.monthDetails.resultShort', { amount: wholeA11y(-b.result) })
            : t('decide.home.monthDetails.rowA11y', { label: resultCaption, value: wholeA11y(b.result) })
        }
        style={[styles.breakdownRow, styles.resultRow, { borderTopColor: dark ? colors.inkSoft2 : colors.line2 }]}
      >
        <Text style={{ ...label, fontWeight: '600', color: ink, flexShrink: 1 }}>{resultCaption}</Text>
        <Text style={{ ...label, fontWeight: '600', color: short ? colors.danger : ink }}>{resultValue}</Text>
      </View>
      {onPots === undefined ? null : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('decide.home.monthDetails.potsLink')}
          onPress={onPots}
          style={({ pressed }) => [styles.potsLink, { opacity: pressed ? PRESSED_OPACITY : 1 }]}
        >
          <Text style={{ ...label, color: colors.accent }}>{`${t('decide.home.monthDetails.potsLink')} ›`}</Text>
        </Pressable>
      )}
      {potsInfo.sheet}
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
  breakdown: { gap: space.gapSm },
  breakdownRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', columnGap: space.gapMd },
  resultRow: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: space.gapSm },
  potsLink: { alignSelf: 'flex-start', minHeight: space.touchMin, minWidth: space.touchMin, justifyContent: 'center' },
});
