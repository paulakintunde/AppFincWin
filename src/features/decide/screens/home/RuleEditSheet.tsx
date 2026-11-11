/**
 * 06.1-22 (D49): edit one rule. Variants: debt share (a 5 to 60 % stepper), keep at least (an amount a month), largest purchase
 * (an amount), a category rule (its amount or share), and saving / investing at least, which are read-only here and open Grow.
 * "Answers check this rule" switches it on or off. Save goes through commitRule: when the new rule makes an open check cross it,
 * the haptic is the warning one and the toast names the check. "Remove this rule" is for the user's own rules and is undoable.
 */
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useT } from '@/i18n';
import { space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { fontSize, textRole } from '@/theme/typography';
import { MoneyInput } from '@/ui/MoneyInput';
import { Pill } from '@/ui/Pill';
import { Sheet, SheetScroll } from '@/ui/Sheet';
import { SheetHeader } from '@/ui/SheetHeader';
import { Stepper } from '@/ui/Stepper';
import { Text } from '@/ui/Text';
import { ToggleRow } from '@/ui/ToggleRow';
import { useIsDirty } from '@/ui/useIsDirty';
import { commitRule, type RuleLabel } from './commitRule';
import { DEBT_STEP_MAX, DEBT_STEP_MIN, debtStepperValue, removeRule, upsertRule, type Crossing, type RulesDoc, type StoredRule } from './homeCardsModel';
import type { RuleTarget } from './MoneyRulesCard';
import type { RulesPatch } from './useHomeCards';

export interface RuleEditSheetProps {
  visible: boolean;
  target: RuleTarget | null;
  doc: RulesDoc;
  dsrLine: string | null;
  currency: string;
  formatMoney: (minor: number) => string;
  categoryName: (id: string) => string;
  /** Today's debt payments as a share of pay, for the debt variant's line; null hides it. */
  debtToday: { percent: number; amount: number; pay: number } | null;
  /** What a usual month leaves today, for the keep variant's line; null hides it. */
  usualLeft: number | null;
  crossings: (patch: RulesPatch) => readonly Crossing[];
  save: (patch: RulesPatch, label: RuleLabel) => string | null;
  onOpenGrow: () => void;
  onDismiss: () => void;
}

export function RuleEditSheet(props: RuleEditSheetProps) {
  return props.visible && props.target !== null ? <RuleEditForm {...props} target={props.target} /> : null;
}

function RuleEditForm({ target, doc, dsrLine, currency, formatMoney, categoryName, debtToday, usualLeft, crossings, save, onOpenGrow, onDismiss }: RuleEditSheetProps & { target: RuleTarget }) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const stored = target.kind === 'stored' ? target.rule : null;
  const [start] = useState(() => ({
    on: target.kind === 'debt' ? dsrLine !== null : stored !== null ? stored.on : true,
    value: target.kind === 'debt' ? debtStepperValue(dsrLine) : stored !== null ? stored.value : 0,
  }));
  const [draft, setDraft] = useState(start);
  const dirty = useIsDirty(start, draft);
  const small = { ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkMuted };

  const readOnly = target.kind === 'saving' || target.kind === 'investing';
  const section = target.kind === 'stored' ? (target.rule.kind === 'category_cap' || target.rule.kind === 'category_share' ? 'category' : target.rule.kind) : target.kind;
  const title =
    section === 'debt' ? t('decide.screens.sheetsHome.rule.debt.title')
    : section === 'saving' ? t('decide.screens.sheetsHome.rule.saving.title')
    : section === 'investing' ? t('decide.screens.sheetsHome.rule.investing.title')
    : section === 'keep' ? t('decide.screens.sheetsHome.rule.keep.title')
    : section === 'largest' ? t('decide.screens.sheetsHome.rule.largest.title')
    : stored !== null ? categoryName(stored.categoryId ?? '') : '';
  const sub =
    section === 'debt' ? t('decide.screens.sheetsHome.rule.debt.sub')
    : section === 'saving' ? t('decide.screens.sheetsHome.rule.saving.sub')
    : section === 'investing' ? t('decide.screens.sheetsHome.rule.investing.sub')
    : section === 'keep' ? t('decide.screens.sheetsHome.rule.keep.sub')
    : section === 'largest' ? t('decide.screens.sheetsHome.rule.largest.sub')
    : '';

  const needsAmount = section === 'keep' || section === 'largest' || (stored !== null && stored.kind === 'category_cap');
  const valid = !draft.on || section === 'debt' || !needsAmount || draft.value > 0;

  const doSave = () => {
    if (readOnly) return;
    if (target.kind === 'debt') {
      commitRule({ patch: { dsrLine: draft.on ? String(draft.value) : null }, label: 'ruleEdited', crossings, save, doneKey: 'decide.screens.sheetsHome.rule.savedToast' });
    } else if (stored !== null) {
      const next: StoredRule = { ...stored, on: draft.on, value: draft.value };
      commitRule({ patch: { doc: upsertRule(doc, next) }, label: 'ruleEdited', crossings, save, doneKey: 'decide.screens.sheetsHome.rule.savedToast' });
    }
    onDismiss();
  };

  const doRemove = () => {
    if (stored === null) return;
    commitRule({ patch: { doc: removeRule(doc, stored.id) }, label: 'ruleRemoved', crossings, save, doneKey: 'decide.screens.sheetsHome.rule.removedToast' });
    onDismiss();
  };

  return (
    <Sheet visible onDismiss={onDismiss} accessibilityLabel={title} dirty={dirty}>
      <SheetHeader title={title} cancelLabel={t('decide.screens.common.cancel')} onCancel={onDismiss} />
      <SheetScroll contentContainerStyle={styles.column}>
        <Text style={small}>{sub}</Text>

        {readOnly ? (
          <>
            <Text style={{ ...textRole(pairing, 'bodyStrong'), color: colors.ink }}>
              {t(target.kind === 'saving' ? 'decide.screens.sheetsHome.rulesCard.savingAtLeast' : 'decide.screens.sheetsHome.rulesCard.investingAtLeast', { amount: formatMoney(target.kind === 'saving' || target.kind === 'investing' ? target.amount : 0) })}
            </Text>
            <Pill label={t(target.kind === 'saving' ? 'decide.screens.sheetsHome.rule.saving.open' : 'decide.screens.sheetsHome.rule.investing.open')} variant="primary" onPress={onOpenGrow} />
          </>
        ) : (
          <>
            <ToggleRow label={t('decide.screens.sheetsHome.rule.answersCheck')} value={draft.on} onChange={(on) => setDraft((d) => ({ ...d, on }))} />
            {section === 'debt' || (stored !== null && stored.kind === 'category_share') ? (
              <>
                <Stepper
                  value={draft.value}
                  step={1}
                  min={section === 'debt' ? DEBT_STEP_MIN : 1}
                  max={section === 'debt' ? DEBT_STEP_MAX : 100}
                  onChange={(value) => setDraft((d) => ({ ...d, value }))}
                  valueText={t('decide.screens.sheetsHome.rule.debt.value', { percent: String(draft.value) })}
                  accessibilityLabel={t('decide.screens.sheetsHome.rule.debt.value', { percent: String(draft.value) })}
                  decrementLabel={t('decide.screens.sheetsHome.rule.debt.lessA11y')}
                  incrementLabel={t('decide.screens.sheetsHome.rule.debt.moreA11y')}
                />
                {section === 'debt' && debtToday !== null ? (
                  <Text style={small}>
                    {t('decide.screens.sheetsHome.rule.debt.today', { percent: String(debtToday.percent), amount: formatMoney(debtToday.amount), pay: formatMoney(debtToday.pay) })}
                  </Text>
                ) : null}
              </>
            ) : (
              <View style={styles.column}>
                <MoneyInput
                  value={draft.value > 0 ? draft.value : null}
                  currency={currency}
                  onChange={(minor) => setDraft((d) => ({ ...d, value: minor ?? 0 }))}
                  label={t(section === 'keep' ? 'decide.screens.sheetsHome.rule.keep.field' : 'decide.screens.sheetsHome.rule.largest.field')}
                  accessibilityLabel={t(section === 'keep' ? 'decide.screens.sheetsHome.rule.keep.field' : 'decide.screens.sheetsHome.rule.largest.field')}
                  boxed
                />
                {section === 'keep' && usualLeft !== null ? (
                  <Text style={small}>{t('decide.screens.sheetsHome.rule.keep.today', { left: formatMoney(usualLeft) })}</Text>
                ) : null}
              </View>
            )}
            <Pill label={t('decide.screens.sheetsHome.rule.save')} variant="primary" disabled={!valid} onPress={doSave} />
            {stored !== null ? <Pill label={t('decide.screens.sheetsHome.rule.remove')} variant="danger" onPress={doRemove} /> : null}
          </>
        )}
      </SheetScroll>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  column: { gap: space.gapSm, paddingBottom: space.gapMd },
});
