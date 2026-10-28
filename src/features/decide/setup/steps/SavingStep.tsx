/**
 * Plan 05.2-24: "Regular saving". Fixed / Flexible per saving series (skipping leaves it fixed), and saving buckets that
 * become envelopes (savings_goals, kind 'pot', with a `bucket`). The total line compares the buckets with the regular
 * saving (D-22): when they add up to more, a tile says so and offers two choices; neither is required and Next never waits.
 */
import React, { forwardRef, useContext, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '@/ui/Text';
import { Chip } from '@/ui/Chip';
import { Pill } from '@/ui/Pill';
import type { TextInput as TextInputInstance } from '@/ui/TextInput';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, space } from '@/theme/layout';
import { categorySwatch, warnTint, type CategorySwatchKey } from '@/theme/tokens';
import { fontSize, textRole } from '@/theme/typography';
import { hapticSelection } from '@/ui/haptics';
import { showToast } from '@/state/undoToast';
import { monthlyEquivalent } from '@/engine/decide';
import { minorUnits } from '@/engine/money';
import { useAccounts } from '@/data/queries/accounts';
import { useCategories } from '@/data/queries/categories';
import { usePots } from '@/data/queries/decide';
import { useRecurringSeries } from '@/data/queries/recurringSeries';
import { usePatchSeriesAttributes } from '@/data/mutations/seriesAttributes';
import { useAddPot, useEditPot } from '@/data/mutations/decidePots';
import type { RecurringSeriesRow } from '@/db/rows';
import type { SavingsGoalPatch, SavingsGoalRow } from '@/db/savingsGoals';
import { useRecordContext } from '@/features/record/useRecordContext';
import { MoneyInput } from '@/features/decide/ui/MoneyInput';
import { ChoiceCard } from '@/features/decide/ui/ChoiceCard';
import { MAX_INPUT_MINOR } from '@/features/decide/snapshot/checkInputs';
import { useShouldStack } from '@/features/decide/ui/textFit';
import { useScrollIntoView } from '@/features/decide/ui/scrollIntoView';
import { EditSeriesFromContext } from '@/features/income/steps/editSeriesFromContext';
import { ChipRow, Meta, Why, useCopy, useNoWrapMoney, useReportReady, type Copy } from '@/features/income/steps/shared';
import type { SetupStepBodyProps, SetupStepHandle } from './types';
import { amountForMonthly, bucketReadiness, bucketTotalLine, splitMonths } from './savingModel';

type BucketKey = NonNullable<SavingsGoalRow['bucket']>;
type Mode = 'fixed' | 'flexible';

const BUCKETS: readonly { key: BucketKey; labelKey: string }[] = [
  { key: 'college', labelKey: 'decide.setup.saving.bucketCollege' },
  { key: 'house', labelKey: 'decide.setup.saving.bucketHouse' },
  { key: 'car', labelKey: 'decide.setup.saving.bucketCar' },
  { key: 'trip', labelKey: 'decide.setup.saving.bucketTrip' },
  { key: 'business', labelKey: 'decide.setup.saving.bucketBusiness' },
  { key: 'wedding', labelKey: 'decide.setup.saving.bucketWedding' },
  { key: 'other', labelKey: 'decide.setup.saving.bucketOther' },
];

const SWATCH_ORDER = Object.keys(categorySwatch) as CategorySwatchKey[];
const NO_SERIES: readonly RecurringSeriesRow[] = [];

interface Entry {
  monthly: number | null;
  goal: number | null;
}

const clamp = (minor: number | null): number | null => (minor !== null && minor >= 0 && minor <= MAX_INPUT_MINOR ? minor : null);

function SeriesCard({ series, accountName, mode, onMode, t }: { series: RecurringSeriesRow; accountName: string; mode: Mode | null; onMode: (m: Mode) => void; t: Copy }) {
  const { colors, pairing } = useTheme();
  const noWrap = useNoWrapMoney(series.currency);
  const monthly = Number(monthlyEquivalent(minorUnits(Math.abs(series.amount)), series.freq));
  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line2 }]}>
      <View style={styles.head}>
        <View style={styles.headText}>
          <Text style={{ ...textRole(pairing, 'sheetTitle'), color: colors.ink }}>{t('decide.setup.saving.toAccount', { account: accountName })}</Text>
          <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkMuted }}>
            {t('decide.setup.saving.aroundDay', { day: Number(series.anchor_date.slice(8, 10)) })}
          </Text>
        </View>
        <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={{ ...textRole(pairing, 'body'), color: colors.ink, flexShrink: 0 }}>
          {noWrap(monthly)}
        </Text>
      </View>
      <View accessibilityRole="radiogroup" accessibilityLabel={accountName} style={{ gap: space.gapSm }}>
        {(['fixed', 'flexible'] as const).map((m) => {
          const title = t(m === 'fixed' ? 'decide.setup.saving.optionFixed' : 'decide.setup.saving.optionFlexible');
          return (
            <ChoiceCard key={m} selected={mode === m} onPress={() => onMode(m)} title={title} accessibilityLabel={title}>
              <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: mode === m ? colors.inkSoft1 : colors.inkMuted }}>
                {t(m === 'fixed' ? 'decide.setup.saving.optionFixedDesc' : 'decide.setup.saving.optionFlexibleDesc')}
              </Text>
            </ChoiceCard>
          );
        })}
      </View>
    </View>
  );
}

export const SavingStep = forwardRef<SetupStepHandle, SetupStepBodyProps>(function SavingStep({ onReadyChange }, ref) {
  const t = useCopy();
  const { colors, pairing } = useTheme();
  const rc = useRecordContext();
  const householdId = rc.householdId ?? undefined;
  const userId = rc.userId ?? undefined;
  const home = rc.homeCurrency;
  const noWrapHome = useNoWrapMoney(home);
  const stacked = useShouldStack();
  const scrollIntoView = useScrollIntoView();

  const seriesQuery = useRecurringSeries(householdId);
  const accountsQuery = useAccounts(householdId);
  const categoriesQuery = useCategories(userId);
  const potsQuery = usePots(userId, householdId);

  const patcher = usePatchSeriesAttributes(householdId ?? '', userId ?? '');
  const { add } = useAddPot();
  const { edit } = useEditPot();
  const editFrom = useContext(EditSeriesFromContext);

  const savingCategoryIds = useMemo(
    () => new Set((categoriesQuery.data ?? []).filter((c) => c.builtin_key === 'Savings').map((c) => c.id)),
    [categoriesQuery.data]
  );
  const savingSeries = useMemo(
    () =>
      (seriesQuery.data ?? NO_SERIES).filter(
        (s) =>
          s.deleted_at === null &&
          s.category_id !== null &&
          savingCategoryIds.has(s.category_id) &&
          s.currency === home &&
          (s.end_date === null || s.end_date >= rc.today)
      ),
    [seriesQuery.data, savingCategoryIds, home, rc.today]
  );
  const regularMonthly = savingSeries.reduce((sum, s) => sum + Number(monthlyEquivalent(minorUnits(Math.abs(s.amount)), s.freq)), 0);

  // Existing saving buckets (one per kind; the envelopes step lists the rest).
  const existing = useMemo(() => {
    const map = new Map<BucketKey, SavingsGoalRow>();
    for (const p of potsQuery.data?.plain ?? []) if (p.bucket != null && !map.has(p.bucket)) map.set(p.bucket, p);
    return map;
  }, [potsQuery.data]);

  const [modes, setModes] = useState<Record<string, Mode>>({});
  const [picked, setPicked] = useState<readonly BucketKey[]>([]);
  const [entries, setEntries] = useState<Partial<Record<BucketKey, Entry>>>({});

  const chosen: BucketKey[] = [...existing.keys(), ...picked.filter((k) => !existing.has(k))];
  const entryOf = (k: BucketKey): Entry => {
    const e = entries[k];
    if (e) return e;
    const row = existing.get(k);
    return { monthly: row?.monthly_amount ?? null, goal: row?.target ?? null };
  };
  const monthlies = chosen.map((k) => entryOf(k).monthly ?? 0);
  const total = bucketTotalLine(monthlies, regularMonthly, savingSeries.length);

  const modeOf = (s: RecurringSeriesRow): Mode | null => modes[s.id] ?? s.saving_mode ?? null;
  const modeChanges = savingSeries.filter((s) => modes[s.id] !== undefined && modes[s.id] !== (s.saving_mode ?? null));
  const bucketChanges = chosen.filter((k) => {
    const row = existing.get(k);
    const e = entryOf(k);
    if (!row) return true;
    return (e.monthly ?? 0) !== (row.monthly_amount ?? 0) || e.goal !== (row.target ?? null);
  });
  const dirty = modeChanges.length > 0 || bucketChanges.length > 0;
  useReportReady(onReadyChange, true, null, dirty);

  useImperativeHandle(ref, () => ({
    save() {
      if (householdId === undefined || userId === undefined || !dirty) return { stepId: null };
      const steps: string[] = [];
      const modeStep =
        modeChanges.length === 0
          ? null
          : patcher.patch(
              modeChanges.map((s) => ({ series: s, attributes: { saving_mode: modes[s.id] as Mode } })),
              'setupStepSaved',
              t('decide.setup.saving.title')
            );
      if (modeStep) steps.push(modeStep.stepId);
      bucketChanges.forEach((k) => {
        const row = existing.get(k);
        const e = entryOf(k);
        if (row) {
          const patch: SavingsGoalPatch = { monthly_amount: e.monthly ?? 0 };
          if (e.goal !== (row.target ?? null)) patch.target = e.goal;
          steps.push(edit(row, patch));
        } else {
          const label = BUCKETS.find((b) => b.key === k)!.labelKey;
          const swatch = SWATCH_ORDER[chosen.indexOf(k) % SWATCH_ORDER.length] as CategorySwatchKey;
          const { stepId } = add({
            householdId,
            ownerId: userId,
            pot: { name: t(label), currency: home, opening_saved: 0, color_key: swatch, bucket: k, target: e.goal, ready_by: null, monthly_amount: e.monthly ?? 0 },
          });
          steps.push(stepId);
        }
      });
      return { stepId: steps[0] ?? null };
    },
  }));

  const monthlyRefs = useRef<Partial<Record<BucketKey, TextInputInstance | null>>>({});
  const cardRefs = useRef<Partial<Record<BucketKey, View | null>>>({});
  const lowerABucket = (): void => {
    let largest: BucketKey | null = null;
    for (const k of chosen) if (largest === null || (entryOf(k).monthly ?? 0) > (entryOf(largest).monthly ?? 0)) largest = k;
    if (largest === null) return;
    scrollIntoView(cardRefs.current[largest] ?? null, 'top');
    monthlyRefs.current[largest]?.focus();
  };

  const raiseSaving = (): void => {
    if (editFrom === null || total.kind !== 'more' || savingSeries.length !== 1 || householdId === undefined || userId === undefined) return;
    const s = savingSeries[0]!;
    const stepId = editFrom({
      id: s.id,
      householdId,
      expectedVersion: s.version,
      patch: { amount: amountForMonthly(s.freq, total.raiseTo) },
      effectiveFrom: rc.today,
      ownerId: userId,
      name: s.name,
    });
    showToast({
      kind: 'ordinary',
      text: { key: 'decide.setup.saving.toastRaised', params: { amount: noWrapHome(total.raiseTo), undoLabel: 'seriesEdited', name: s.name } },
      stepId,
    });
  };

  const accountName = (s: RecurringSeriesRow): string => accountsQuery.data?.find((a) => a.id === s.account_id)?.name ?? s.name;
  const swatchOf = (k: BucketKey): CategorySwatchKey => (existing.get(k)?.color_key ?? SWATCH_ORDER[chosen.indexOf(k) % SWATCH_ORDER.length]) as CategorySwatchKey;

  const canRaise =
    editFrom !== null &&
    total.kind === 'more' &&
    total.canRaise &&
    savingSeries.length === 1 &&
    Number(monthlyEquivalent(minorUnits(amountForMonthly(savingSeries[0]!.freq, total.raiseTo)), savingSeries[0]!.freq)) === total.raiseTo;

  return (
    <View style={{ gap: space.groupGap }}>
      {savingSeries.map((s) => (
        <SeriesCard key={s.id} series={s} accountName={accountName(s)} mode={modeOf(s)} onMode={(m) => setModes({ ...modes, [s.id]: m })} t={t} />
      ))}

      <View style={{ gap: space.gapSm }}>
        <View style={styles.forHead}>
          <Text style={{ ...textRole(pairing, 'sheetTitle'), color: colors.ink }}>{t('decide.setup.saving.forTitle')}</Text>
          <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkMuted }}>{t('decide.setup.shell.optional')}</Text>
        </View>
        <ChipRow label={t('decide.setup.saving.bucketsA11y')} role="none">
          {BUCKETS.map((b) => {
            const isExisting = existing.has(b.key);
            const on = isExisting || picked.includes(b.key);
            return (
              <Chip
                key={b.key}
                label={t(b.labelKey)}
                selected={on}
                onPress={
                  isExisting
                    ? undefined
                    : () => {
                        hapticSelection();
                        setPicked(on ? picked.filter((k) => k !== b.key) : [...picked, b.key]);
                      }
                }
              />
            );
          })}
        </ChipRow>
      </View>

      {chosen.map((k) => {
        const label = t(BUCKETS.find((b) => b.key === k)!.labelKey);
        const e = entryOf(k);
        const row = existing.get(k);
        const ready = bucketReadiness(row?.opening_saved ?? 0, e.monthly ?? 0, e.goal);
        let readyText: string;
        if (ready.kind === 'addGoal') readyText = t('decide.setup.saving.readinessNoGoal');
        else if (ready.kind === 'addMonthly') readyText = t('decide.setup.saving.readinessNoMonthly');
        else if (ready.months === 0) readyText = t('decide.setup.saving.readinessReached');
        else {
          const { years, months } = splitMonths(ready.months);
          const time = [years > 0 ? t('decide.setup.saving.years', { count: years }) : '', months > 0 ? t('decide.setup.saving.months', { count: months }) : ''].filter(Boolean).join(' ');
          readyText = t('decide.setup.saving.readiness', { monthly: noWrapHome(ready.monthly), time, goal: noWrapHome(ready.target) });
        }
        return (
          <View
            key={k}
            ref={(node) => {
              cardRefs.current[k] = node;
            }}
            style={[styles.bucket, { backgroundColor: colors.surface, borderColor: colors.line2 }]}
          >
            <View style={styles.bucketHead}>
              <View style={[styles.dot, { backgroundColor: categorySwatch[swatchOf(k)].color }]} />
              <Text style={{ ...textRole(pairing, 'sheetTitle'), color: colors.ink, flexShrink: 1 }}>{label}</Text>
            </View>
            <View style={stacked ? styles.fieldsStacked : styles.fieldsRow}>
              <View style={stacked ? undefined : styles.field}>
                <MoneyInput
                  value={e.monthly}
                  currency={home}
                  onChange={(m) => setEntries({ ...entries, [k]: { ...e, monthly: clamp(m) } })}
                  label={t('decide.setup.saving.eachMonth')}
                  accessibilityLabel={t('decide.setup.saving.monthlyBucketA11y', { name: label })}
                  inputRef={(node) => {
                    monthlyRefs.current[k] = node;
                  }}
                  boxed
                />
              </View>
              <View style={stacked ? undefined : styles.field}>
                <MoneyInput
                  value={e.goal}
                  currency={home}
                  onChange={(g) => setEntries({ ...entries, [k]: { ...e, goal: clamp(g) } })}
                  label={t('decide.setup.saving.goalOptional')}
                  accessibilityLabel={t('decide.setup.saving.goalBucketA11y', { name: label })}
                  boxed
                />
              </View>
            </View>
            <Meta text={readyText} />
          </View>
        );
      })}

      {total.kind === 'empty' ? (
        <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.s13_5, color: colors.inkMuted }}>{t('decide.setup.saving.totalNone')}</Text>
      ) : total.kind === 'equal' ? (
        <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.s13_5, color: colors.ink }}>
          {t('decide.setup.saving.totalEqual', { bucketTotal: noWrapHome(total.total), saving: noWrapHome(total.regular) })}
        </Text>
      ) : total.kind === 'less' ? (
        <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.s13_5, color: colors.ink }}>
          {t('decide.setup.saving.totalLess', { bucketTotal: noWrapHome(total.total), saving: noWrapHome(total.regular), rest: noWrapHome(total.general) })}
        </Text>
      ) : (
        <View style={[styles.tile, { backgroundColor: warnTint }]}>
          <View
            accessible
            accessibilityLabel={t('decide.setup.saving.overA11y', { text: t('decide.setup.saving.overLine', { amount: noWrapHome(total.over) }).replace(/\.$/, '') })}
            style={{ gap: space.gapSm }}
          >
            <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.s13_5, fontWeight: '700', color: colors.warn1 }}>
              {t('decide.setup.saving.overLine', { amount: noWrapHome(total.over) })}
            </Text>
            <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.s13_5, color: colors.warn1 }}>{t('decide.setup.saving.overExplain')}</Text>
          </View>
          <Pill label={t('decide.setup.saving.lower')} variant="secondary" onPress={lowerABucket} />
          {canRaise ? <Pill label={t('decide.setup.saving.raise', { amount: noWrapHome(total.raiseTo) })} variant="secondary" onPress={raiseSaving} /> : null}
        </View>
      )}

      <Why textKey="decide.setup.saving.why" />
    </View>
  );
});

const styles = StyleSheet.create({
  card: { borderRadius: radii.card, borderWidth: 1, padding: space.cardPad, gap: space.gapMd },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: space.gapMd },
  headText: { flex: 1, flexShrink: 1, gap: 2 },
  forHead: { gap: 2 },
  bucket: { borderRadius: 16, borderWidth: 1, padding: space.cardPad, gap: space.gapMd },
  bucketHead: { flexDirection: 'row', alignItems: 'center', gap: space.gapSm },
  dot: { width: 12, height: 12, borderRadius: 6 },
  fieldsRow: { flexDirection: 'row', gap: space.gapMd },
  fieldsStacked: { gap: space.gapMd },
  field: { flex: 1 },
  tile: { borderRadius: 16, padding: space.cardPad, gap: space.gapMd },
});
