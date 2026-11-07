// 06-22 (G03, D-23, D-25): make a goal in three short steps, or edit one on a single page. Step 3 asks the lock question with NO
// answer chosen: "Make goal" stays disabled until the user answers (no silent default, D-23). The monthly record ("Record it each
// month for me to confirm") only ever records an Expected line the user confirms; nothing moves by itself. The sheet never sends
// the safety-net flag: only set_safety_net flags a goal.
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import * as Crypto from 'expo-crypto';
import { useSaveGoalPlan, type EditGoalPlanFields } from '@/data/mutations/growGoals';
import { useAccounts } from '@/data/queries/accounts';
import { useCategoryLookup } from '@/data/queries/categories';
import { useDecideSettings } from '@/data/queries/decide';
import { useRecurringSeries } from '@/data/queries/recurringSeries';
import type { GoalPlanSeries } from '@/db/goalPlan';
import type { RecurringSeriesRow } from '@/db/rows';
import type { SavingsGoalRow } from '@/db/savingsGoals';
import { useT } from '@/i18n';
import { usePastContext } from '@/features/decide/past/usePastDecisions';
import { lastDayOfMonth } from '@/features/decide/pots/potsModel';
import { useCalcFormat } from '@/features/grow/calculators/typed/CalcFields';
import { AccountPicker } from '@/features/record/entry/pickers/AccountPicker';
import { GrowGlyph, type GrowGlyphName } from '@/features/grow/ui/GrowGlyph';
import { LinkedPairFields } from '@/features/grow/ui/LinkedPairFields';
import { pushOnce } from '@/shell/navigation/pushOnce';
import { getDeviceTimeZone } from '@/services/locale/deviceLocale';
import { radii, space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { ACCENT_TINT_OPACITY } from '@/theme/tokens';
import { textRole } from '@/theme/typography';
import { Chip } from '@/ui/Chip';
import { ConfirmSheet } from '@/ui/ConfirmSheet';
import { hapticLight } from '@/ui/haptics';
import { useAmountParser } from '@/ui/money/useAmountParser';
import { MoneyInput } from '@/ui/MoneyInput';
import { Pill } from '@/ui/Pill';
import { Row } from '@/ui/Row';
import { Sheet, SheetScroll } from '@/ui/Sheet';
import { SheetHeader } from '@/ui/SheetHeader';
import { Text } from '@/ui/Text';
import { TextInput } from '@/ui/TextInput';
import { ToggleRow } from '@/ui/ToggleRow';
import { goalHref } from '@/features/grow/home/GoalRow';
import { isSafetyNetRow, monthStartFromText, nextRecordDate, planFromBy, planFromMonthly } from './goalPlanModel';
import { seriesPayload } from './GoalPlanEditSheet';
import { useGoalToast } from './useGoalToast';
import { useGoalsRead } from './useGoalsRead';

type Icon = NonNullable<SavingsGoalRow['icon']>;
const ICONS: readonly Icon[] = ['calendar', 'laptop', 'phone', 'camera', 'savings', 'housing', 'transport', 'headphones'];
const SUGGESTIONS = ['holiday', 'phone', 'car', 'home', 'wedding'] as const;
const NAME_MAX = 80;

export interface NewGoalPrefill {
  name?: string;
  /** Minor units. */
  target?: number;
  checkId?: string;
}

export interface NewGoalSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Present: edit mode, one page, prefilled. */
  goal?: SavingsGoalRow;
  /** Edit mode: the goal's saved so far (goal currency), so a target below it is refused. */
  saved?: number;
  /** Add mode, for the "Create from Decide" entry. */
  prefill?: NewGoalPrefill;
}

export function NewGoalSheet(props: NewGoalSheetProps) {
  return props.visible ? <GoalForm {...props} /> : null;
}

type Lock = 'yes' | 'no' | null;

function GoalForm({ onClose, goal, saved = 0, prefill }: NewGoalSheetProps) {
  const t = useT() as (key: string, params?: Record<string, string | number>) => string;
  const { colors, pairing } = useTheme();
  const { userId, householdId, today, ctx } = usePastContext();
  const calc = useCalcFormat();
  const parser = useAmountParser();
  const accountsQ = useAccounts(householdId ?? undefined);
  const seriesQ = useRecurringSeries(householdId ?? undefined);
  const cats = useCategoryLookup(userId ?? undefined);
  const settings = useDecideSettings(userId ?? undefined).data ?? null;
  const read = useGoalsRead();
  const { save } = useSaveGoalPlan();
  const toast = useGoalToast();
  const edit = goal !== undefined;
  const currency = goal?.currency ?? ctx.home;

  const accounts = useMemo(() => (accountsQ.data ?? []).filter((a) => a.archived_at === null && a.currency === currency), [accountsQ.data, currency]);
  const existingSeries: RecurringSeriesRow | null = useMemo(
    () => (goal === undefined ? null : ((seriesQ.data ?? []).find((s) => s.goal_id === goal.id && s.deleted_at === null && s.end_date === null) ?? null)),
    [seriesQ.data, goal]
  );

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [name, setName] = useState(goal?.name ?? prefill?.name ?? '');
  const [icon, setIcon] = useState<Icon | null>(goal?.icon ?? null);
  const [target, setTarget] = useState<number | null>(goal ? goal.target : (prefill?.target ?? null));
  const [noTarget, setNoTarget] = useState(goal ? goal.target === null : false);
  const [savedAlready, setSavedAlready] = useState<number | null>(null);
  const [monthlyText, setMonthlyText] = useState('');
  const [byText, setByText] = useState('');
  const [lastEdited, setLastEdited] = useState<'first' | 'second'>('first');
  const [record, setRecord] = useState(true);
  const [keptInId, setKeptInId] = useState<string | null | undefined>(undefined);
  const [fromId, setFromId] = useState<string | null>(null);
  const [picker, setPicker] = useState<'keptIn' | 'from' | null>(null);
  const [lock, setLock] = useState<Lock>(goal ? (goal.locked === true ? 'yes' : 'no') : null);
  const [asking, setAsking] = useState(false);

  const trimmed = name.trim();
  const keptIn = keptInId === undefined ? (accounts[0] ?? null) : (accounts.find((a) => a.id === keptInId) ?? null);
  const from = accounts.find((a) => a.id === fromId) ?? accounts.find((a) => a.id !== keptIn?.id) ?? keptIn;
  const havePlanSaved = edit ? saved : (savedAlready ?? 0);

  // The linked pair: one side is typed, the other follows.
  const typedMonthly = (() => {
    if (monthlyText.trim() === '') return null;
    const r = parser.parse(monthlyText, currency);
    return r.ok && r.value > 0 ? (r.value as number) : null;
  })();
  const typedBy = monthStartFromText(byText);
  let monthly: number | null = null;
  let readyBy: string | null = null;
  let derivedMonthly = '';
  let derivedBy = '';
  if (!noTarget && target !== null) {
    if (lastEdited === 'first') {
      monthly = typedMonthly;
      if (typedMonthly !== null) {
        const { reachesOn } = planFromMonthly({ saved: havePlanSaved, target, monthly: typedMonthly, today });
        if (reachesOn !== null) {
          derivedBy = calc.monthYear(reachesOn);
          readyBy = lastDayOfMonth(reachesOn.slice(0, 7));
        }
      }
    } else if (typedBy !== null) {
      const needed = planFromBy({ saved: havePlanSaved, target, byMonthStart: typedBy, today });
      if (needed !== null && needed > 0) {
        monthly = needed;
        derivedMonthly = parser.toInputText(needed, currency);
        readyBy = lastDayOfMonth(typedBy.slice(0, 7));
      }
    }
  } else {
    monthly = typedMonthly;
  }

  const dirtyNow = trimmed !== (goal?.name ?? prefill?.name ?? '') || monthlyText !== '' || byText !== '' || (!edit && savedAlready !== null);
  const targetBelowSaved = edit && !noTarget && target !== null && target < saved;
  const step1Ok = trimmed.length >= 1 && trimmed.length <= NAME_MAX;
  const step2Ok = noTarget || (target !== null && target > 0);
  const canMake = step1Ok && step2Ok && lock !== null && !targetBelowSaved && userId !== null && householdId !== null;

  const rule = settings === null ? null : settings.saving_floor;
  const currentMonthly = edit ? (goal.monthly_amount ?? 0) : 0;
  const total = read.model.monthlyIntoGoals - currentMonthly + (monthly ?? 0);
  const totalLine =
    rule === null || rule === undefined
      ? t('grow.goals.create.totalLineNoRule', { amount: calc.money(total) })
      : t('grow.goals.create.totalLine', { amount: calc.money(total), rule: calc.money(rule) });

  const tryClose = () => (dirtyNow ? setAsking(true) : onClose());

  const make = () => {
    if (!canMake || userId === null || householdId === null || lock === null) return;
    const locked = lock === 'yes';
    const finalTarget = noTarget ? null : target;
    if (goal !== undefined) {
      const fields: EditGoalPlanFields = {};
      if (trimmed !== goal.name) fields.name = trimmed;
      if (icon !== (goal.icon ?? null) && icon !== null) fields.icon = icon;
      if (finalTarget !== goal.target) fields.target = finalTarget;
      if (locked !== (goal.locked === true) && !isSafetyNetRow(goal)) fields.locked = locked;
      if (Object.keys(fields).length === 0) {
        onClose();
        return;
      }
      const series = existingSeries === null ? null : seriesPayload(existingSeries, Math.abs(existingSeries.amount));
      const { stepId } = save({ ownerId: userId, existing: goal, fields, series });
      hapticLight();
      onClose();
      toast({ key: 'undo.label.goalPlanChanged', stepId, undoLabel: 'goalPlanChanged', name: trimmed, userId, householdId });
      return;
    }
    let series: GoalPlanSeries | null = null;
    if (record && monthly !== null && monthly > 0 && from !== null) {
      series = {
        id: Crypto.randomUUID(),
        account_id: from.id,
        amount: monthly,
        anchor_date: nextRecordDate(today),
        time_zone: getDeviceTimeZone(),
        name: trimmed,
        category_id: cats.transferCategoryId,
      };
    }
    const result = save({
      ownerId: userId,
      householdId,
      fields: {
        name: trimmed,
        currency,
        locked: lock === 'yes',
        target: finalTarget,
        ready_by: noTarget ? null : readyBy,
        monthly_amount: monthly,
        opening_saved: savedAlready ?? 0,
        ...(keptIn !== null ? { account_id: keptIn.id } : {}),
        ...(icon !== null ? { icon } : {}),
      },
      series,
    });
    hapticLight();
    onClose();
    toast({ key: 'grow.goals.create.madeToast', stepId: result.stepId, undoLabel: 'goalMade', name: trimmed, userId, householdId });
    pushOnce(goalHref(result.id));
  };

  const title = edit ? t('grow.goals.detail.edit') : t(`grow.goals.create.step${step}Title`);

  const nameBlock = (
    <View style={styles.block}>
      <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>{t('grow.goals.create.nameLabel')}</Text>
      <View style={[styles.field, { borderColor: colors.line2, backgroundColor: colors.surface }]}>
        <TextInput
          testID="goal-name"
          accessibilityLabel={t('grow.goals.create.nameLabel')}
          value={name}
          onChangeText={setName}
          maxLength={NAME_MAX}
          placeholder={t('grow.goals.create.namePlaceholder')}
          placeholderTextColor={colors.inkFaint}
          style={{ ...textRole(pairing, 'body'), color: colors.ink, minHeight: space.touchMin, padding: 0 }}
        />
      </View>
      {edit ? null : (
        <View style={styles.chips}>
          {SUGGESTIONS.map((s) => (
            <Chip key={s} label={t(`grow.goals.create.suggestions.${s}`)} onPress={() => setName(t(`grow.goals.create.suggestions.${s}`))} />
          ))}
        </View>
      )}
      <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>{t('grow.goals.create.iconLabel')}</Text>
      <View style={styles.icons}>
        {ICONS.map((i) => {
          const on = icon === i;
          return (
            <Pressable
              key={i}
              testID={`goal-icon-${i}`}
              accessibilityRole="button"
              accessibilityLabel={t(`grow.goals.create.icons.${i}`)}
              accessibilityState={{ selected: on }}
              onPress={() => setIcon(i)}
              style={[styles.tile, { backgroundColor: colors.fill1, borderColor: on ? colors.accent : 'transparent' }]}
            >
              <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: colors.accent, opacity: on ? ACCENT_TINT_OPACITY : 0, borderRadius: radii.glyphTile }]} />
              <GrowGlyph name={i as GrowGlyphName} color={on ? colors.accent : colors.inkMuted} size={22} />
            </Pressable>
          );
        })}
      </View>
    </View>
  );

  const targetBlock = (
    <View style={styles.block}>
      <ToggleRow label={t('grow.goals.create.noTarget')} value={noTarget} onChange={setNoTarget} />
      {noTarget ? null : (
        <MoneyInput
          value={target}
          currency={currency}
          onChange={setTarget}
          label={t('grow.goals.create.targetLabel')}
          accessibilityLabel={t('grow.goals.create.targetLabel')}
          boxed
          zeroHint
        />
      )}
      {targetBelowSaved ? (
        <Text style={{ ...textRole(pairing, 'label'), color: colors.danger }}>{t('grow.goals.create.targetBelowSaved', { saved: calc.money(saved) })}</Text>
      ) : null}
      {edit ? null : (
        <MoneyInput
          value={savedAlready}
          currency={currency}
          onChange={setSavedAlready}
          label={t('grow.goals.create.savedLabel')}
          accessibilityLabel={t('grow.goals.create.savedLabel')}
          boxed
          zeroHint
        />
      )}
    </View>
  );

  const fillBlock = (
    <View style={styles.block}>
      {noTarget ? (
        <MoneyInput
          value={typedMonthly}
          currency={currency}
          onChange={(m) => setMonthlyText(m === null ? '' : parser.toInputText(m, currency))}
          label={t('grow.goals.create.eachMonthLabel')}
          accessibilityLabel={t('grow.goals.create.eachMonthLabel')}
          boxed
          zeroHint
        />
      ) : (
        <>
          <LinkedPairFields
            first={{
              label: t('grow.goals.create.eachMonthLabel'),
              value: lastEdited === 'first' ? monthlyText : derivedMonthly,
              onChangeText: (v) => {
                setLastEdited('first');
                setMonthlyText(v);
              },
            }}
            second={{
              label: t('grow.goals.create.byLabel'),
              value: lastEdited === 'second' ? byText : derivedBy,
              onChangeText: (v) => {
                setLastEdited('second');
                setByText(v);
              },
              keyboardType: 'default',
              placeholder: t('grow.goals.create.byPlaceholder'),
            }}
            lastEdited={lastEdited}
            derivedAnnouncement={lastEdited === 'first' ? derivedBy : derivedMonthly}
          />
          <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>{t('grow.goals.create.linkedNote')}</Text>
        </>
      )}
      <Row
        label={t('grow.goals.create.keptIn')}
        value={keptIn === null ? t('grow.goals.move.pickAccount') : keptIn.name}
        dense
        chevron
        onPress={() => setPicker('keptIn')}
      />
      <ToggleRow label={t('grow.goals.create.recordSwitch')} value={record} onChange={setRecord} />
      {record ? (
        <Row
          label={t('grow.goals.move.from')}
          value={from === null ? t('grow.goals.move.pickAccount') : from.name}
          dense
          chevron
          onPress={() => setPicker('from')}
        />
      ) : null}
      <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>{totalLine}</Text>
    </View>
  );

  const lockBlock = (
    <View style={styles.block} accessibilityRole="radiogroup" accessibilityLabel={t('grow.goals.create.lockQuestion')}>
      <Text style={{ ...textRole(pairing, 'body'), color: colors.ink }}>{t('grow.goals.create.lockQuestion')}</Text>
      <View style={styles.chips}>
        <Chip label={t('grow.goals.create.lockYes')} selected={lock === 'yes'} onPress={() => setLock('yes')} />
        <Chip label={t('grow.goals.create.lockNo')} selected={lock === 'no'} onPress={() => setLock('no')} />
      </View>
      <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>{t('grow.goals.create.lockHelper')}</Text>
    </View>
  );

  const makeLabel = t(edit ? 'grow.goals.create.save' : 'grow.goals.create.make');

  return (
    <Sheet visible onDismiss={tryClose} accessibilityLabel={title}>
      <SheetHeader title={title} cancelLabel={t('grow.goals.create.close')} onCancel={tryClose} />
      <SheetScroll>
        <View style={styles.body}>
          {edit ? null : (
            <View style={styles.stepRow}>
              <Text testID="goal-step-bar" style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>
                {t('grow.goals.create.stepBar', { step })}
              </Text>
              {step > 1 ? (
                <Pressable accessibilityRole="button" accessibilityLabel={t('grow.goals.create.back')} onPress={() => setStep((s) => (s === 3 ? 2 : 1))} style={styles.back}>
                  <Text style={{ ...textRole(pairing, 'label'), color: colors.accent }}>{t('grow.goals.create.back')}</Text>
                </Pressable>
              ) : null}
            </View>
          )}
          {edit ? (
            <>
              {nameBlock}
              {targetBlock}
              {isSafetyNetRow(goal) ? null : lockBlock}
            </>
          ) : step === 1 ? (
            nameBlock
          ) : step === 2 ? (
            targetBlock
          ) : (
            <>
              {fillBlock}
              {lockBlock}
            </>
          )}
          {edit || step === 3 ? (
            <Pill label={makeLabel} variant="primary" disabled={!canMake} onPress={make} accessibilityLabel={makeLabel} />
          ) : (
            <Pill
              label={t('grow.goals.create.next')}
              variant="primary"
              disabled={step === 1 ? !step1Ok : !step2Ok}
              onPress={() => setStep((s) => (s === 1 ? 2 : 3))}
            />
          )}
        </View>
      </SheetScroll>
      <AccountPicker
        visible={picker !== null}
        title={t(picker === 'from' ? 'grow.goals.move.from' : 'grow.goals.create.keptIn')}
        accounts={accounts}
        selectedId={picker === 'from' ? (from?.id ?? null) : (keptIn?.id ?? null)}
        onSelect={(a) => {
          if (picker === 'from') setFromId(a.id);
          else setKeptInId(a.id);
          setPicker(null);
        }}
        onClose={() => setPicker(null)}
      />
      <ConfirmSheet
        visible={asking}
        title={t('grow.goals.create.discardTitle')}
        cancelLabel={t('grow.goals.create.keepGoing')}
        confirmLabel={t('grow.goals.create.discard')}
        destructive
        onCancel={() => setAsking(false)}
        onConfirm={() => {
          setAsking(false);
          onClose();
        }}
      />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: space.groupGap, paddingBottom: space.groupGap },
  block: { gap: space.gapMd },
  stepRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  back: { minHeight: space.touchMin, justifyContent: 'center' },
  field: { borderWidth: 1.5, borderRadius: radii.glyphTile + 3, paddingHorizontal: 12, justifyContent: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.gapSm },
  icons: { flexDirection: 'row', flexWrap: 'wrap', gap: space.gapSm },
  tile: { width: space.touchMin, height: space.touchMin, borderRadius: radii.glyphTile, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
});
