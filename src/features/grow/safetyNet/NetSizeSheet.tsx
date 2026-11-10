// 06-16 (G04a, criterion 7, T-06-16-01, T-06-16-04): choose the safety net's size. Four radio rows (what you set, 1 month of going out,
// 3 months, your own amount) and a preview card: each open check is re-judged with the new size before anything is saved, and
// the result is announced politely ("Laptop, now Not yet"). 'create' (no flagged goal) is the ONLY path that sends
// `is_safety_net: true`; a flagged row with no size yet (or any existing net) takes the edit path. Saving is a light haptic and a
// toast with Undo; Decide's next answer uses the new size.
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useEditGoal, useSaveGoalPlan } from '@/data/mutations/growGoals';
import { useOpenChecks } from '@/data/queries/decide';
import { useDecideV3 } from '@/data/queries/decideV3';
import type { SavingsGoalRow } from '@/db/savingsGoals';
import { useT } from '@/i18n';
import { usePastContext } from '@/features/decide/past/usePastDecisions';
import { useSettledLabel } from '@/features/decide/check/useSettledLabel';
import { useGoalMoney } from '@/features/grow/home/useGoalMoney';
import { useGoalToast } from '@/features/grow/goals/useGoalToast';
import { radii, space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { textRole } from '@/theme/typography';
import { hapticLight } from '@/ui/haptics';
import { MoneyInput } from '@/ui/MoneyInput';
import { Pill } from '@/ui/Pill';
import { RadioDot } from '@/ui/RadioDot';
import { Sheet, SheetScroll } from '@/ui/Sheet';
import { SheetHeader } from '@/ui/SheetHeader';
import { Text } from '@/ui/Text';
import { ToggleRow } from '@/ui/ToggleRow';
import { essentialMonthOf, previewNetSize, type NetPreviewRow } from './netPreview';

export interface NetSizeSheetProps {
  visible: boolean;
  /** The flagged goal, or null when the user has no safety net (create mode). */
  net: SavingsGoalRow | null;
  /** Saved so far in the net's own currency (edit mode refuses a size below it). */
  saved: number;
  onClose: () => void;
}

type Choice = 'current' | 'one' | 'three' | 'own';

export function NetSizeSheet(props: NetSizeSheetProps) {
  return props.visible ? <SizeForm {...props} /> : null;
}

function PreviewRow({ row }: { row: NetPreviewRow }) {
  const t = useT() as (key: string, params?: Record<string, string | number>) => string;
  const { colors, pairing } = useTheme();
  const money = useGoalMoney();
  const before = t(`grow.safetyNet.sizeSheet.states.${row.before}`);
  const after = t(`grow.safetyNet.sizeSheet.states.${row.after}`);
  const text =
    row.price === null
      ? t('grow.safetyNet.sizeSheet.previewRowNoPrice', { name: row.name, before, after })
      : t('grow.safetyNet.sizeSheet.previewRow', { name: row.name, amount: money.amount(row.price), before, after });
  const spoken = useSettledLabel(t('grow.safetyNet.sizeSheet.previewA11y', { name: row.name, state: after }), row.after, 600);
  return (
    <Text testID={`net-preview-${row.id}`} accessibilityLabel={spoken} accessibilityLiveRegion="polite" style={{ ...textRole(pairing, 'label'), color: colors.ink }}>
      {text}
    </Text>
  );
}

function SizeForm({ net, saved, onClose }: NetSizeSheetProps) {
  const t = useT() as (key: string, params?: Record<string, string | number>) => string;
  const { colors, pairing } = useTheme();
  const { userId, householdId, ctx } = usePastContext();
  const money = useGoalMoney();
  const v3 = useDecideV3();
  const checksQ = useOpenChecks(userId ?? undefined, householdId ?? undefined);
  const { save } = useSaveGoalPlan();
  const { edit } = useEditGoal();
  const toast = useGoalToast();
  const mode: 'create' | 'edit' = net === null ? 'create' : 'edit';
  const current = net?.target ?? null;

  const source = v3.source ?? null;
  const essential = useMemo(() => {
    if (source === null) return null;
    try {
      return essentialMonthOf(source, v3.v3 ?? null);
    } catch {
      return null;
    }
  }, [source, v3.v3]);

  const [choice, setChoice] = useState<Choice>(current !== null ? 'current' : essential !== null ? 'one' : 'own');
  const [own, setOwn] = useState<number | null>(null);
  const [protect, setProtect] = useState(net === null ? true : net.protect !== false);

  const size: number | null = choice === 'current' ? current : choice === 'one' ? essential : choice === 'three' ? (essential === null ? null : essential * 3) : own;
  const belowSaved = mode === 'edit' && size !== null && size < saved;
  const valid = size !== null && size > 0 && !belowSaved && userId !== null;

  const rows = useMemo<NetPreviewRow[]>(() => {
    if (size === null || size <= 0 || source === null) return [];
    try {
      const checks = (checksQ.data ?? []).map((c) => ({ id: c.id, name: c.name, inputs: c.inputs }));
      return previewNetSize({ source, v3: v3.v3 ?? null, checks, newSize: size });
    } catch {
      return [];
    }
  }, [size, source, v3.v3, checksQ.data]);

  const options: { key: Choice; label: string }[] = [];
  if (current !== null) options.push({ key: 'current', label: t('grow.safetyNet.sizeSheet.whatYouSet', { amount: money.amount(current) }) });
  if (essential !== null) {
    options.push({ key: 'one', label: t('grow.safetyNet.sizeSheet.months', { count: 1, amount: money.amount(essential) }) });
    options.push({ key: 'three', label: t('grow.safetyNet.sizeSheet.months', { count: 3, amount: money.amount(essential * 3) }) });
  }
  options.push({ key: 'own', label: t('grow.safetyNet.sizeSheet.own') });

  const onSave = () => {
    if (!valid || size === null || userId === null) return;
    let stepId: string;
    let name: string;
    if (net === null) {
      if (householdId === null) return;
      const fields = {
        name: t('grow.safetyNet.title'),
        currency: ctx.home,
        locked: true,
        protect,
        target: size,
        ready_by: null,
        monthly_amount: null,
        opening_saved: 0,
        is_safety_net: true,
      };
      const res = save({ ownerId: userId, householdId, fields, series: null });
      stepId = res.stepId;
      name = fields.name;
    } else {
      stepId = edit(net, protect !== (net.protect !== false) ? { target: size, protect } : { target: size }, userId, saved);
      name = net.name;
    }
    hapticLight();
    onClose();
    toast({ key: 'grow.safetyNet.sizeSheet.savedToast', params: { amount: money.amount(size) }, stepId, undoLabel: 'safetyNetSizeSaved', name, userId, householdId });
  };

  const title = t('grow.safetyNet.sizeSheet.title');
  return (
    <Sheet visible onDismiss={onClose} accessibilityLabel={title}>
      <SheetHeader title={title} cancelLabel={t('grow.common.cancel')} onCancel={onClose} />
      <SheetScroll>
        <View style={styles.body}>
          <View accessibilityRole="radiogroup" style={styles.group}>
            {options.map((o) => {
              const on = choice === o.key;
              return (
                <Pressable
                  key={o.key}
                  testID={`net-size-${o.key}`}
                  accessibilityRole="radio"
                  accessibilityLabel={o.label}
                  accessibilityState={{ selected: on, checked: on }}
                  onPress={() => setChoice(o.key)}
                  style={[styles.option, { borderColor: on ? colors.accent : colors.line1, backgroundColor: colors.surface }]}
                >
                  <RadioDot selected={on} />
                  <Text style={{ ...textRole(pairing, 'body'), color: colors.ink, flex: 1 }}>{o.label}</Text>
                </Pressable>
              );
            })}
          </View>
          {choice === 'own' ? (
            <MoneyInput value={own} currency={ctx.home} onChange={setOwn} label={t('grow.safetyNet.sizeSheet.ownField')} accessibilityLabel={t('grow.safetyNet.sizeSheet.ownField')} boxed />
          ) : null}
          {belowSaved ? (
            <Text testID="net-size-below" style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>
              {t('grow.safetyNet.sizeSheet.belowSaved', { saved: money.amount(saved) })}
            </Text>
          ) : null}
          <ToggleRow label={t('grow.safetyNet.sizeSheet.protect')} value={protect} onChange={setProtect} />
          <View testID="net-preview" style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line1 }]}>
            <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>{t('grow.safetyNet.sizeSheet.previewTitle')}</Text>
            {rows.length === 0 ? (
              <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>{t('grow.safetyNet.sizeSheet.previewNone')}</Text>
            ) : (
              rows.map((r) => <PreviewRow key={r.id} row={r} />)
            )}
          </View>
          <Pill label={t('grow.safetyNet.sizeSheet.save')} variant="primary" disabled={!valid} onPress={onSave} />
        </View>
      </SheetScroll>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: space.groupGap, paddingBottom: space.groupGap },
  group: { gap: space.gapSm },
  option: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: space.gapMd, borderWidth: 1, borderRadius: radii.card, paddingHorizontal: space.cardPad },
  card: { borderWidth: 1, borderRadius: radii.card, padding: space.cardPad, gap: space.gapSm },
});
