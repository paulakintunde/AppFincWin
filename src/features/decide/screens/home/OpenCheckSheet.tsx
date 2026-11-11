/**
 * 06.1-22 (D46, D46D, D-13; the changed note is changeSinceLooked's answer, computed in useOpenCheckRows): one open check's actions from Decide home. The header names the item and its state line; when the
 * records changed since it was last looked at the sheet says so. Rows: See today's answer, Edit the check, Save for it in Grow,
 * Mark as not buying, and Delete (a danger text row with no dialog: an undoable soft delete and a toast). A draft check leads
 * with "Choose how to pay", which opens the installment plan sheet; nothing is written until the plan is used.
 */
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { useNotBuying, useSaveForIt } from '@/data/mutations/decideOutcome';
import { useRemoveDecision, useSaveCheckDraft } from '@/data/mutations/decideChecks';
import type { DecideCheckRow } from '@/db/decideChecks';
import { readStoredCheck, toStoredV2, type CheckV2, type LocalDate, type PayV2 } from '@/engine/decide/v3';
import { useT } from '@/i18n';
import { showToast } from '@/state/undoToast';
import { space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { fontSize, textRole } from '@/theme/typography';
import { hapticLight } from '@/ui/haptics';
import { Sheet, SheetScroll } from '@/ui/Sheet';
import { SheetHeader } from '@/ui/SheetHeader';
import { Text } from '@/ui/Text';
import { useCheckEngine } from '../engine/useCheckEngine';
import { DatePickerSheet } from '../sheets/DatePickerSheet';
import { InstallmentPlanSheet } from '../sheets/InstallmentPlanSheet';
import type { OpenCheckRowModel } from './homeCardsModel';
import { useRowBadge } from './OpenChecksCard';

export interface OpenCheckSheetProps {
  visible: boolean;
  check: DecideCheckRow | null;
  model: OpenCheckRowModel | null;
  currency: string;
  today: LocalDate;
  locale: string;
  formatMoney: (minor: number) => string;
  formatDate: (date: LocalDate) => string;
  onDismiss: () => void;
}

/** A default monthly amount for "Save for it": the target spread over the months to the ready date, 6 when there is none. */
export function defaultMonthly(target: number, readyBy: string | null, today: string): number {
  let months = 6;
  if (readyBy !== null && /^\d{4}-\d{2}/.test(readyBy)) {
    const gap = (Number(readyBy.slice(0, 4)) - Number(today.slice(0, 4))) * 12 + (Number(readyBy.slice(5, 7)) - Number(today.slice(5, 7)));
    months = Math.min(24, Math.max(1, gap));
  }
  return Math.max(1, Math.ceil(target / months));
}

export function OpenCheckSheet(props: OpenCheckSheetProps) {
  return props.visible && props.check !== null && props.model !== null ? <OpenCheckBody {...props} check={props.check} model={props.model} /> : null;
}

function OpenCheckBody({ check: row, model, currency, today, locale, formatMoney, formatDate, onDismiss }: OpenCheckSheetProps & { check: DecideCheckRow; model: OpenCheckRowModel }) {
  const t = useT();
  const router = useRouter();
  const { colors, pairing } = useTheme();
  const badge = useRowBadge(model);
  const stored = useMemo<CheckV2>(() => readStoredCheck(row.inputs).check, [row.inputs]);
  const engine = useCheckEngine(stored, { checkId: row.id });
  const { save: saveForIt } = useSaveForIt();
  const { pass } = useNotBuying();
  const { remove } = useRemoveDecision();
  const draftSave = useSaveCheckDraft();
  const [planOpen, setPlanOpen] = useState(false);
  const [datePick, setDatePick] = useState<{ current: LocalDate | null; set: (d: LocalDate) => void } | null>(null);

  const stateLine = [
    badge.word,
    model.price === null ? null : formatMoney(model.price),
    model.date === null ? null : formatDate(model.date),
    model.left === null || model.draft ? null : t('decide.screens.sheetsHome.openChecks.leaves', { left: formatMoney(model.left) }),
    model.checkedOn === null || model.draft ? null : t('decide.screens.sheetsHome.openCheck.checkedOn', { date: formatDate(model.checkedOn) }),
  ]
    .filter((x): x is string => x !== null)
    .join(' · ');

  const open = (pathname: string) => {
    hapticLight();
    onDismiss();
    router.push({ pathname, params: { id: row.id } } as Href);
  };

  const evaluation = engine.evaluation;
  const canSave = evaluation !== null && evaluation.purchase !== null;

  const doSave = () => {
    if (evaluation === null || evaluation.purchase === null) return;
    const target = stored.pay.mode === 'plan' ? evaluation.purchase.dayOne : evaluation.purchase.whole;
    if (!Number.isSafeInteger(target) || target <= 0) return;
    const readyBy = evaluation.result.readyBy;
    const readyText = readyBy === null ? null : readyBy.kind === 'date' ? readyBy.date : `${readyBy.month}-01`;
    hapticLight();
    onDismiss();
    void saveForIt({ check: row, v3: stored, evaluation, monthly: defaultMonthly(target, readyText, today), currency, today });
  };

  const doNotBuying = () => {
    if (evaluation === null) return;
    hapticLight();
    onDismiss();
    pass({ check: row, evaluation });
  };

  const doDelete = () => {
    hapticLight();
    const stepId = remove(row);
    onDismiss();
    showToast({ kind: 'destructive', text: { key: 'decide.screens.common.toast.deleted', params: { item: row.name } }, stepId });
  };

  const usePlan = (pay: Extract<PayV2, { mode: 'plan' }>) => {
    draftSave.save({ id: row.id, name: row.name, inputs: toStoredV2({ ...stored, pay }) as Record<string, unknown>, furthestStep: row.furthest_step });
    setPlanOpen(false);
    onDismiss();
  };

  const actionRow = (key: string, label: string, onPress: () => void, opts?: { danger?: boolean; disabled?: boolean }) => (
    <Pressable
      key={key}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: opts?.disabled === true }}
      disabled={opts?.disabled === true}
      onPress={onPress}
      style={({ pressed }) => [styles.action, { backgroundColor: pressed ? colors.fill6 : 'transparent', borderBottomColor: colors.line1, opacity: opts?.disabled === true ? 0.4 : 1 }]}
    >
      <Text style={{ ...textRole(pairing, 'body'), fontWeight: '500', color: opts?.danger === true ? colors.danger : colors.ink }}>{label}</Text>
    </Pressable>
  );

  const title = model.name;
  return (
    <Sheet visible onDismiss={onDismiss} accessibilityLabel={title}>
      <SheetHeader title={title} cancelLabel={t('decide.screens.common.close')} onCancel={onDismiss} />
      <SheetScroll contentContainerStyle={styles.column}>
        <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkMuted }}>{stateLine}</Text>
        {model.changed ? (
          <View accessibilityLiveRegion="polite">
            <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.warn1 }}>{t('decide.screens.sheetsHome.openCheck.changed')}</Text>
          </View>
        ) : null}
        <View>
          {model.draft ? actionRow('pay', t('decide.screens.sheetsHome.openCheck.choosePay'), () => setPlanOpen(true)) : null}
          {actionRow('see', t('decide.screens.sheetsHome.openCheck.seeToday'), () => open('/decide/answer/[id]'), { disabled: model.draft && model.price === null })}
          {actionRow('edit', t('decide.screens.sheetsHome.openCheck.edit'), () => open('/decide/check/[id]'))}
          {actionRow('save', t('decide.screens.sheetsHome.openCheck.saveForIt'), doSave, { disabled: !canSave || model.draft })}
          {actionRow('pass', t('decide.screens.sheetsHome.openCheck.notBuying'), doNotBuying, { disabled: evaluation === null || model.draft })}
          {actionRow('delete', t('decide.screens.common.delete'), doDelete, { danger: true })}
        </View>
      </SheetScroll>
      <InstallmentPlanSheet
        visible={planOpen}
        check={stored}
        currency={currency}
        today={today}
        formatMoney={formatMoney}
        formatDate={formatDate}
        onPickDate={(current, set) => setDatePick({ current, set })}
        onUse={usePlan}
        onDismiss={() => setPlanOpen(false)}
      />
      {datePick === null ? null : (
        <DatePickerSheet
          visible
          check={stored}
          today={today}
          paydays={[]}
          locale={locale}
          formatDate={formatDate}
          onUse={(d) => {
            datePick.set(d);
            setDatePick(null);
          }}
          onDismiss={() => setDatePick(null)}
        />
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  column: { gap: space.gapSm, paddingBottom: space.gapMd },
  action: { minHeight: 52, justifyContent: 'center', borderBottomWidth: 1 },
});
