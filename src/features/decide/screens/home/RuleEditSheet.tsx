/**
 * 06.1-22 (D49): edit one rule. Variants: debt share (a 5 to 60 % stepper), keep at least (an amount a month), largest purchase
 * (an amount), a category rule (its amount or share), and saving / investing at least, which are read-only here and open Grow.
 * "Answers check this rule" switches it on or off. Save goes through commitRule: when the new rule makes an open check cross it,
 * the haptic is the warning one and the toast names the check. "Remove this rule" is for the user's own rules and is undoable.
 * 06.1-58 (A-SH-2, D49): a percent rule picks from preset chips (30 / 33 / 36 / 40) or Other, which opens a whole-percent field with a
 * '%' after it; a money rule has the currency symbol in its field. The "today" line shows only where the engine's figures are passed
 * in (debt share: debtToday; keep at least: usualLeft); nothing is worked out here. The switch row comes after the value, as in D49.
 * The dismiss button says Close. Built-in rules (the debt share) can only be switched off; own rules also have Remove (T-06.1-58-02).
 */
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useT } from '@/i18n';
import { radii, space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { fontSize, textRole } from '@/theme/typography';
import { MoneyInput } from '@/ui/MoneyInput';
import { Pill } from '@/ui/Pill';
import { Sheet, SheetScroll } from '@/ui/Sheet';
import { SheetHeader } from '@/ui/SheetHeader';
import { Chip } from '@/ui/Chip';
import { CustomValueField } from '@/ui/CustomValueChips';
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

  const percentRule = section === 'debt' || (stored !== null && stored.kind === 'category_share');
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
      <SheetHeader title={title} cancelLabel={t('decide.screens.sheetsHome.rule.close')} onCancel={onDismiss} />
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
            {percentRule ? (
              <>
                <PercentChips
                  value={draft.value}
                  min={section === 'debt' ? DEBT_STEP_MIN : 1}
                  max={section === 'debt' ? DEBT_STEP_MAX : 100}
                  label={section === 'debt' ? t('decide.screens.sheetsHome.rule.debt.title') : t('decide.screens.sheetsHome.addRule.percent')}
                  onChange={(value) => setDraft((d) => ({ ...d, value }))}
                />
                {section === 'debt' && debtToday !== null ? (
                  <Text testID="rule-today" style={[styles.today, { ...textRole(pairing, 'body'), color: colors.ink, backgroundColor: colors.fill6 }]}>
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
                  prefix="symbol"
                />
                {section === 'keep' && usualLeft !== null ? (
                  <Text testID="rule-today" style={[styles.today, { ...textRole(pairing, 'body'), color: colors.ink, backgroundColor: colors.fill6 }]}>
                    {t('decide.screens.sheetsHome.rule.keep.today', { left: formatMoney(usualLeft) })}
                  </Text>
                ) : null}
              </View>
            )}
            <ToggleRow label={t('decide.screens.sheetsHome.rule.answersCheck')} value={draft.on} onChange={(on) => setDraft((d) => ({ ...d, on }))} />
            <Pill label={t('decide.screens.sheetsHome.rule.save')} variant="primary" disabled={!valid} onPress={doSave} />
            {stored !== null ? <Pill label={t('decide.screens.sheetsHome.rule.remove')} variant="danger" onPress={doRemove} /> : null}
          </>
        )}
      </SheetScroll>
    </Sheet>
  );
}

/** D49: the preset shares of pay, then Other. */
export const PERCENT_PRESETS: readonly number[] = [30, 33, 36, 40];

/** A-SH-2: preset chips for a percent rule; Other opens a whole-percent field ('%' after it) within the rule's range. */
export function PercentChips({ value, min, max, label, onChange }: { value: number; min: number; max: number; label: string; onChange: (value: number) => void }) {
  const t = useT();
  const preset = PERCENT_PRESETS.includes(value);
  const [other, setOther] = useState(!preset);
  const percent = (n: number): string => t('decide.screens.sheetsHome.rule.percentChip', { percent: String(n) });
  return (
    <View style={styles.column}>
      <View accessibilityRole="radiogroup" accessibilityLabel={label} style={styles.chips}>
        {PERCENT_PRESETS.map((p) => (
          <Chip
            key={p}
            label={percent(p)}
            selected={!other && value === p}
            onPress={() => {
              setOther(false);
              onChange(p);
            }}
          />
        ))}
        <Chip
          label={other ? t('decide.screens.sheetsHome.rule.otherValue', { percent: String(value) }) : t('decide.screens.sheetsHome.rule.other')}
          selected={other}
          onPress={() => setOther(true)}
        />
      </View>
      {other ? (
        <CustomValueField
          value={value}
          min={min}
          max={max}
          rangeText={t('decide.screens.sheetsHome.rule.range', { from: String(min), to: String(max) })}
          unitWord="%"
          groupLabel={label}
          onChange={onChange}
          autoFocus={preset}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  column: { gap: space.gapSm, paddingBottom: space.gapMd },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.gapSm },
  today: { borderRadius: radii.card, paddingHorizontal: space.cardPad, paddingVertical: space.gapMd, overflow: 'hidden' },
});
