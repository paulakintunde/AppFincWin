/**
 * 06.1-22 (D46, D46D, D-13; the changed note is changeSinceLooked's answer, computed in useOpenCheckRows): one open check's actions from Decide home. The header names the item and its state line; when the
 * records changed since it was last looked at the sheet says so. Rows: See today's answer, Edit the check, Save for it in Grow,
 * Mark as not buying, and Delete (a danger text row with no dialog: an undoable soft delete and a toast). A draft check leads
 * with "Choose how to pay", which opens the installment plan sheet; nothing is written until the plan is used.
 *
 * 06.1-53 (C-22, DB-11): on a draft the greyed Save for it in Grow and Mark as not buying say they wait for an answer; once the check
 * has an answer they are live. H-8: "Edit the check" opens the stepper where a big-buy draft stopped, else the Price step (OQ-53-1 A);
 * "Save for it in Grow" opens the same Save for it screen the answer uses (no goal is made from here); a greyed "See today's answer"
 * says a price is needed; a chosen plan shows a toast; a draft says what it still needs in one line.
 *
 * 06.1-58 (A-SH-1, D46): the state is a badge (glyph plus word) over the price, date and what it leaves, with "Checked <date>" on
 * its own line; the records-changed note sits in a notYet tint box; the actions are one grouped card, rows split by a hairline rule,
 * each with a chevron except Delete (a danger row that opens nothing). The NeedLines and H-8 actions are unchanged.
 *
 * 06.1-80 (DC-9): Delete shows "Deleted: <name>." at once, with Undo. The delete is the soft delete useRemoveDecision writes as one
 * decisionDeleted step; the toast names that label (`undoLabel`) and the check (`target`), so Undo clears deleted_at and the check
 * comes back with its inputs untouched.
 */
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { Href } from 'expo-router';
import { useNotBuying } from '@/data/mutations/decideOutcome';
import { useRemoveDecision, useSaveCheckDraft } from '@/data/mutations/decideChecks';
import type { DecideCheckRow } from '@/db/decideChecks';
import { readStoredCheck, toStoredV2, type CheckV2, type LocalDate, type PayV2 } from '@/engine/decide/v3';
import { useT } from '@/i18n';
import { pushOnce } from '@/shell/navigation/pushOnce';
import { showToast } from '@/state/undoToast';
import { radii, space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { stateColors } from '@/theme/tokens';
import { fontSize, textRole } from '@/theme/typography';
import { hapticLight } from '@/ui/haptics';
import { Sheet, SheetScroll } from '@/ui/Sheet';
import { SheetHeader } from '@/ui/SheetHeader';
import { StateBadge } from '@/ui/StateBadge';
import { Text } from '@/ui/Text';
import { StateGlyph } from '@/ui/glyphs/StateGlyph';
import { firstStepFor, KEY_KIND, KEY_VISITED, stepHref, type StepNumber } from '../check/useStepCheck';
import { useCheckEngine } from '../engine/useCheckEngine';
import { DatePickerSheet } from '../sheets/DatePickerSheet';
import { InstallmentPlanSheet } from '../sheets/InstallmentPlanSheet';
import { NeedLine } from '../ui/NeedLine';
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

const CHEV = 16;

const clampStep = (n: number): StepNumber => (n >= 3 ? 3 : n <= 1 ? 1 : 2);

/**
 * H-8 / OQ-53-1 A: where "Edit the check" opens. A big-buy draft (a kind was picked, a plan was chosen, or the stepper was visited)
 * resumes at the furthest step it reached; every other check opens the Price step, with its kind kept. furthest_step is read with
 * the stepper's visited list, since the stepper records its progress there.
 */
export function editTarget(row: Pick<DecideCheckRow, 'name' | 'furthest_step'>, check: CheckV2, draft: boolean): StepNumber {
  const raw = check.layerAnswers[KEY_VISITED];
  const visited = Array.isArray(raw) ? raw.filter((n): n is number => typeof n === 'number') : [];
  const big = typeof check.layerAnswers[KEY_KIND] === 'string' || check.pay.mode === 'plan' || visited.length > 0 || row.furthest_step >= 2;
  if (!draft || !big) return 2;
  return clampStep(Math.max(row.furthest_step, ...visited, firstStepFor(check, row.name)));
}

export function OpenCheckSheet(props: OpenCheckSheetProps) {
  return props.visible && props.check !== null && props.model !== null ? <OpenCheckBody {...props} check={props.check} model={props.model} /> : null;
}

function OpenCheckBody({ check: row, model, currency, today, locale, formatMoney, formatDate, onDismiss }: OpenCheckSheetProps & { check: DecideCheckRow; model: OpenCheckRowModel }) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const badge = useRowBadge(model);
  const stored = useMemo<CheckV2>(() => readStoredCheck(row.inputs).check, [row.inputs]);
  const engine = useCheckEngine(stored, { checkId: row.id });
  const { pass } = useNotBuying();
  const { remove } = useRemoveDecision();
  const draftSave = useSaveCheckDraft();
  const [planOpen, setPlanOpen] = useState(false);
  const [datePick, setDatePick] = useState<{ current: LocalDate | null; set: (d: LocalDate) => void } | null>(null);

  const stateLine = [
    model.price === null ? null : formatMoney(model.price),
    model.date === null ? null : formatDate(model.date),
    model.left === null || model.draft ? null : t('decide.screens.sheetsHome.openChecks.leaves', { left: formatMoney(model.left) }),
  ]
    .filter((x): x is string => x !== null)
    .join(' · ');
  const checkedLine = model.checkedOn === null || model.draft ? null : t('decide.screens.sheetsHome.openCheck.checkedOn', { date: formatDate(model.checkedOn) });

  // 06.1-78 (DN-2, T-06.1-78-01): a second tap while the first route opens (the sheet is still closing) is dropped by pushOnce, so
  // Edit the check never stacks two copies of a step. The href is a full outer-stack route.
  const go = (href: Href) => {
    hapticLight();
    onDismiss();
    pushOnce(href);
  };
  const open = (pathname: string) => go({ pathname, params: { id: row.id } } as Href);

  const evaluation = engine.evaluation;
  // DB-11: a check with an answer has Save for it and Mark as not buying live; a draft waits for one (C-22).
  const answered = !model.draft;
  const noPrice = model.draft && model.price === null;
  const notFinished = !model.draft
    ? null
    : model.price === null
      ? t('decide.screens.sheetsHome.openCheck.notFinished.price')
      : model.payNotChosen
        ? t('decide.screens.sheetsHome.openCheck.notFinished.pay')
        : null;

  // H-8 (CC-4, CF-5): the same Save for it screen the answer opens, with its amount and Undo; nothing is written from this sheet.
  const doSave = () => open('/decide/save/[id]');

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
    showToast({
      kind: 'destructive',
      text: { key: 'decide.screens.sheetsHome.openCheck.deleted', params: { name: row.name, undoLabel: 'decisionDeleted' } },
      stepId,
      target: { entity: 'decide_checks', id: row.id },
    });
  };

  const usePlan = (pay: Extract<PayV2, { mode: 'plan' }>) => {
    draftSave.save({ id: row.id, name: row.name, inputs: toStoredV2({ ...stored, pay }) as Record<string, unknown>, furthestStep: row.furthest_step });
    setPlanOpen(false);
    onDismiss();
    // H-8 (CC-9): the choice is said. A draft save carries no undo step; the plan can be changed from the same row.
    showToast({ kind: 'ordinary', text: { key: 'decide.screens.sheetsHome.openCheck.payChosen.plan', params: { name: row.name } }, stepId: null });
  };

  const actionRow = (key: string, label: string, onPress: () => void, opts?: { danger?: boolean; disabled?: boolean; first?: boolean }) => (
    <Pressable
      key={key}
      testID={`open-check-action-${key}`}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: opts?.disabled === true }}
      disabled={opts?.disabled === true}
      onPress={onPress}
      style={({ pressed }) => [
        styles.action,
        opts?.first === true ? null : { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line2 },
        { backgroundColor: pressed ? colors.fill6 : colors.surface, opacity: opts?.disabled === true ? 0.4 : 1 },
      ]}
    >
      <Text style={[styles.actionText, { ...textRole(pairing, 'body'), fontWeight: '500', color: opts?.danger === true ? colors.danger : colors.ink }]}>{label}</Text>
      {opts?.danger === true ? null : <StateGlyph name="chev" color={colors.inkFaint} size={CHEV} />}
    </Pressable>
  );
  const need = (testID: string, text: string | null) =>
    text === null ? null : (
      <View style={styles.need}>
        <NeedLine testID={testID} text={text} />
      </View>
    );

  const title = model.name;
  return (
    <Sheet visible onDismiss={onDismiss} accessibilityLabel={title}>
      <SheetHeader title={title} cancelLabel={t('decide.screens.common.close')} onCancel={onDismiss} />
      <SheetScroll contentContainerStyle={styles.column}>
        <View style={styles.stateRow}>
          <StateBadge tone={badge.tone} shape={badge.shape} label={badge.word} testID="open-check-sheet-badge" />
          {stateLine === '' ? null : (
            <Text style={[styles.stateText, { ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkMuted }]}>{stateLine}</Text>
          )}
        </View>
        {checkedLine === null ? null : (
          <Text testID="open-check-checked" style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkMuted }}>
            {checkedLine}
          </Text>
        )}
        {notFinished === null ? null : (
          <Text testID="open-check-not-finished" style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkDim }}>
            {notFinished}
          </Text>
        )}
        {model.changed ? (
          <View accessibilityLiveRegion="polite" testID="open-check-changed" style={[styles.changed, { backgroundColor: stateColors.notYet.tint }]}>
            <Text style={{ ...textRole(pairing, 'label'), color: stateColors.notYet.color }}>{t('decide.screens.sheetsHome.openCheck.changed')}</Text>
          </View>
        ) : null}
        <View testID="open-check-actions" style={[styles.group, { backgroundColor: colors.surface, borderColor: colors.line2 }]}>
          {model.draft ? actionRow('pay', t('decide.screens.sheetsHome.openCheck.choosePay'), () => setPlanOpen(true), { first: true }) : null}
          {actionRow('see', t('decide.screens.sheetsHome.openCheck.seeToday'), () => open('/decide/answer/[id]'), { disabled: noPrice, first: !model.draft })}
          {need('need-line-see', noPrice ? t('decide.screens.sheetsHome.openCheck.need.price') : null)}
          {actionRow('edit', t('decide.screens.sheetsHome.openCheck.edit'), () => go(stepHref(editTarget(row, stored, model.draft), row.id)))}
          {actionRow('save', t('decide.screens.sheetsHome.openCheck.saveForIt'), doSave, { disabled: !answered })}
          {actionRow('pass', t('decide.screens.sheetsHome.openCheck.notBuying'), doNotBuying, { disabled: !answered || evaluation === null })}
          {need('need-line-answer', answered ? null : t('decide.screens.sheetsHome.openCheck.need.answerFirst'))}
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
  stateRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.gapSm },
  stateText: { flexShrink: 1 },
  changed: { borderRadius: radii.card, paddingHorizontal: space.cardPad, paddingVertical: space.gapMd },
  group: { borderRadius: radii.card, borderWidth: 1.5, overflow: 'hidden' },
  action: { minHeight: 52, paddingHorizontal: space.cardPad, flexDirection: 'row', alignItems: 'center', gap: space.gapMd },
  actionText: { flex: 1 },
  need: { paddingHorizontal: space.cardPad, paddingBottom: space.gapSm },
});
