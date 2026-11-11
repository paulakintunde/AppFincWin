/**
 * 06.1-22 (D50): add one of the user's own rules. A radio list of rule kinds, a value field, "Add rule". Up to 5 own rules: at the
 * cap the primary is disabled and the cap line is the reason. Keep at least and largest purchase can each be added once. Nothing is
 * pre-selected. The save goes through commitRule, the same crossing check as editing.
 */
import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useT } from '@/i18n';
import { space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { fontSize, textRole } from '@/theme/typography';
import { Chip } from '@/ui/Chip';
import { MoneyInput } from '@/ui/MoneyInput';
import { Pill } from '@/ui/Pill';
import { RadioDot } from '@/ui/RadioDot';
import { Sheet, SheetScroll } from '@/ui/Sheet';
import { SheetHeader } from '@/ui/SheetHeader';
import { Stepper } from '@/ui/Stepper';
import { Text } from '@/ui/Text';
import { commitRule, type RuleLabel } from './commitRule';
import { canAddRule, kindTaken, newRuleId, upsertRule, type Crossing, type OwnRuleKind, type RulesDoc } from './homeCardsModel';
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

const KINDS: readonly { kind: OwnRuleKind; title: string; sub: string }[] = [
  { kind: 'category_cap', title: 'category', sub: 'categorySub' },
  { kind: 'category_share', title: 'categoryShare', sub: 'categoryShareSub' },
  { kind: 'largest', title: 'largest', sub: 'largestSub' },
  { kind: 'keep', title: 'keep', sub: 'keepSub' },
];

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
  const needsCategory = kind === 'category_cap' || kind === 'category_share';
  const open = canAddRule(doc);
  const ready = open && kind !== null && (!needsCategory || categoryId !== null) && (kind === 'category_share' || (amount !== null && amount > 0));

  const add = () => {
    if (!ready || kind === null) return;
    const value = kind === 'category_share' ? percentValue : (amount ?? 0);
    const next = upsertRule(doc, { id: newRuleId(kind, doc), kind, on: true, value, categoryId: needsCategory ? categoryId : null });
    commitRule({ patch: { doc: next }, label: 'ruleAdded', crossings, save, doneKey: 'decide.screens.sheetsHome.addRule.toast' });
    onDismiss();
  };

  const title = t('decide.screens.sheetsHome.addRule.title');
  return (
    <Sheet visible onDismiss={onDismiss} accessibilityLabel={title} dirty={kind !== null}>
      <SheetHeader title={title} cancelLabel={t('decide.screens.common.cancel')} onCancel={onDismiss} />
      <SheetScroll contentContainerStyle={styles.column}>
        <Text style={small}>{t('decide.screens.sheetsHome.addRule.kindQ')}</Text>
        <View accessibilityRole="radiogroup" accessibilityLabel={t('decide.screens.sheetsHome.addRule.kindQ')} style={styles.column}>
          {KINDS.map((k) => {
            const taken = kindTaken(doc, k.kind);
            const label = t(`decide.screens.sheetsHome.addRule.${k.title}` as never);
            const selected = kind === k.kind;
            return (
              <Pressable
                key={k.kind}
                accessibilityRole="radio"
                accessibilityLabel={taken ? `${label}, ${t('decide.screens.sheetsHome.addRule.taken')}` : label}
                accessibilityState={{ selected, disabled: taken }}
                disabled={taken}
                onPress={() => setKind(k.kind)}
                style={[styles.radio, { opacity: taken ? 0.4 : 1 }]}
              >
                <RadioDot selected={selected} />
                <View style={styles.grow}>
                  <Text style={{ ...textRole(pairing, 'body'), color: colors.ink }}>{label}</Text>
                  <Text style={small}>{taken ? t('decide.screens.sheetsHome.addRule.taken') : t(`decide.screens.sheetsHome.addRule.${k.sub}` as never)}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>

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

        {kind === 'category_share' ? (
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
        ) : kind !== null ? (
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
      </SheetScroll>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  column: { gap: space.gapSm, paddingBottom: space.gapMd },
  radio: { minHeight: space.touchMin, flexDirection: 'row', alignItems: 'center', gap: space.gapMd },
  grow: { flexShrink: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.gapSm },
});
