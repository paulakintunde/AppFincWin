/**
 * 06.1-22 (D50): add one of the user's own rules. A radio list of rule kinds, a value field, "Add rule". Up to 5 own rules: at the
 * cap the primary is disabled and the cap line is the reason. Keep at least and largest purchase can each be added once. Nothing is
 * pre-selected. The save goes through commitRule, the same crossing check as editing.
 * 06.1-58 (A-SH-3): the kinds sit in one grouped card; the chosen kind has the accent tint as well as the filled dot. The dismiss
 * button says Close.
 * 06.1-80 (DC-7, OQ-80-1 A): only kinds not already on the list are offered (kindsOffered), so "Add rule" always adds a rule and
 * never quietly fills one that is there. DB-13: when "Add rule" is off below the cap, a NeedLine under it says what is missing.
 */
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useT } from '@/i18n';
import { space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { fontSize, textRole } from '@/theme/typography';
import { Chip } from '@/ui/Chip';
import { MoneyInput } from '@/ui/MoneyInput';
import { Pill } from '@/ui/Pill';
import { Sheet, SheetScroll } from '@/ui/Sheet';
import { SheetHeader } from '@/ui/SheetHeader';
import { Stepper } from '@/ui/Stepper';
import { Text } from '@/ui/Text';
import { NeedLine } from '../ui/NeedLine';
import { commitRule, type RuleLabel } from './commitRule';
import { OptionCard, OptionRow } from './OptionCard';
import { canAddRule, kindsOffered, newRuleId, upsertRule, type Crossing, type OwnRuleKind, type RulesDoc } from './homeCardsModel';
import type { RulesPatch } from './useHomeCards';

export interface AddRuleSheetProps {
  visible: boolean;
  doc: RulesDoc;
  currency: string;
  categories: readonly { id: string; name: string }[];
  crossings: (patch: RulesPatch) => readonly Crossing[];
  save: (patch: RulesPatch, label: RuleLabel) => string | null;
  onDismiss: () => void;
}

const COPY: Readonly<Record<OwnRuleKind, { title: string; sub: string }>> = {
  category_cap: { title: 'category', sub: 'categorySub' },
  category_share: { title: 'categoryShare', sub: 'categoryShareSub' },
  largest: { title: 'largest', sub: 'largestSub' },
  keep: { title: 'keep', sub: 'keepSub' },
};

export function AddRuleSheet(props: AddRuleSheetProps) {
  return props.visible ? <AddRuleForm {...props} /> : null;
}

function AddRuleForm({ doc, currency, categories, crossings, save, onDismiss }: AddRuleSheetProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const [kind, setKind] = useState<OwnRuleKind | null>(null);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [amount, setAmount] = useState<number | null>(null);
  const [percentValue, setPercentValue] = useState(10);
  const small = { ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkMuted };
  const offered = kindsOffered(doc);
  // A kind that left the list while the sheet was open (added elsewhere) counts as not chosen.
  const chosen = kind !== null && offered.includes(kind) ? kind : null;
  const needsCategory = chosen === 'category_cap' || chosen === 'category_share';
  const open = canAddRule(doc);
  const hasValue = chosen === 'category_share' || (amount !== null && amount > 0);
  const ready = open && chosen !== null && (!needsCategory || categoryId !== null) && hasValue;
  // DB-13: the reason "Add rule" is off. At the cap the cap line says it, so no NeedLine.
  const need = !open || ready ? null : chosen !== null && hasValue && needsCategory ? t('decide.screens.sheetsHome.addRule.needCategory') : t('decide.screens.sheetsHome.addRule.need');

  const add = () => {
    if (!ready || chosen === null) return;
    const value = chosen === 'category_share' ? percentValue : (amount ?? 0);
    const next = upsertRule(doc, { id: newRuleId(chosen, doc), kind: chosen, on: true, value, categoryId: needsCategory ? categoryId : null });
    commitRule({ patch: { doc: next }, label: 'ruleAdded', crossings, save, doneKey: 'decide.screens.sheetsHome.addRule.toast' });
    onDismiss();
  };

  const title = t('decide.screens.sheetsHome.addRule.title');
  return (
    <Sheet visible onDismiss={onDismiss} accessibilityLabel={title} dirty={chosen !== null}>
      <SheetHeader title={title} cancelLabel={t('decide.screens.sheetsHome.rule.close')} onCancel={onDismiss} />
      <SheetScroll contentContainerStyle={styles.column}>
        <Text style={small}>{t('decide.screens.sheetsHome.addRule.kindQ')}</Text>
        <OptionCard label={t('decide.screens.sheetsHome.addRule.kindQ')} testID="add-rule-kinds">
          {offered.map((k, i) => (
            <OptionRow
              key={k}
              testID={`add-rule-kind-${k}`}
              first={i === 0}
              title={t(`decide.screens.sheetsHome.addRule.${COPY[k].title}` as never)}
              sub={t(`decide.screens.sheetsHome.addRule.${COPY[k].sub}` as never)}
              selected={chosen === k}
              onPress={() => setKind(k)}
            />
          ))}
        </OptionCard>

        {needsCategory ? (
          <>
            <Text style={small}>{t('decide.screens.sheetsHome.addRule.categoryField')}</Text>
            {categories.length === 0 ? (
              <Text style={small}>{t('decide.screens.sheetsHome.addRule.noCategories')}</Text>
            ) : (
              <View style={styles.chips}>
                {categories.map((c) => (
                  <Chip key={c.id} label={c.name} selected={categoryId === c.id} onPress={() => setCategoryId(c.id)} />
                ))}
              </View>
            )}
          </>
        ) : null}

        {chosen === 'category_share' ? (
          <Stepper
            value={percentValue}
            step={1}
            min={1}
            max={100}
            onChange={setPercentValue}
            valueText={t('decide.screens.sheetsHome.rule.debt.value', { percent: String(percentValue) })}
            accessibilityLabel={t('decide.screens.sheetsHome.addRule.percent')}
            decrementLabel={t('decide.screens.sheetsHome.rule.debt.lessA11y')}
            incrementLabel={t('decide.screens.sheetsHome.rule.debt.moreA11y')}
          />
        ) : chosen !== null ? (
          <MoneyInput
            value={amount}
            currency={currency}
            onChange={setAmount}
            label={t('decide.screens.sheetsHome.addRule.value')}
            accessibilityLabel={t('decide.screens.sheetsHome.addRule.value')}
            boxed
          />
        ) : null}

        <Text accessibilityRole={open ? undefined : 'alert'} style={{ ...small, color: open ? colors.inkMuted : colors.warn1 }}>
          {t('decide.screens.sheetsHome.addRule.cap')}
        </Text>
        <Pill label={t('decide.screens.sheetsHome.addRule.add')} variant="primary" disabled={!ready} onPress={add} />
        <NeedLine testID="add-rule-need" text={need} />
      </SheetScroll>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  column: { gap: space.gapSm, paddingBottom: space.gapMd },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.gapSm },
});
