// 06.1-25 (D36, D-19): setup item 5, Your money rules. Each rule is a switch row with a value chip that opens the same edit sheet the
// Decide home card uses (plan 22). Rules are stored once, where plan 22 put them: the debt share in decide_settings.dsr_line and the
// rest as the rules document under custom_options.rules (useMoneyRules). Nothing new is stored here except the D-23 "no rules" flag.
//
//  - Switching a rule on or off, and every sheet save, write at once (one Undo each), through commitRule.
//  - Keep at least and Largest single purchase have no value until the person gives one, so their switch opens the sheet.
//  - Saving the rules with all of them off sets the no-rules flag, says "No rules. Answers still keep your safety net.", and keeps
//    the item ticked; any rule on clears the flag.
//  - Saving and investing at least are the person's regular saving series in Grow, shown as a note and never as engine rules.
import React, { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { useT } from '@/i18n';
import { useSetDecideAnswered } from '@/data/mutations/decideSetup';
import { useCategories } from '@/data/queries/categories';
import { useDecideV3 } from '@/data/queries/decideV3';
import { useRecordContext } from '@/features/record/useRecordContext';
import { showToast } from '@/state/undoToast';
import { radii, space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { fontSize, textRole } from '@/theme/typography';
import { Chip } from '@/ui/Chip';
import { Pill } from '@/ui/Pill';
import { Text } from '@/ui/Text';
import { ToggleRow } from '@/ui/ToggleRow';
import { AddRuleSheet } from '../../home/AddRuleSheet';
import { commitRule } from '../../home/commitRule';
import { canAddRule, DEBT_DEFAULT, debtPercentOf, upsertRule, type StoredRule } from '../../home/homeCardsModel';
import type { RuleTarget } from '../../home/MoneyRulesCard';
import { RuleEditSheet } from '../../home/RuleEditSheet';
import { useMoneyRules, useRuleCrossings } from '../../home/useHomeCards';
import { rulesFactsOf } from '../../home/useHomeFacts';
import { rulesOnCount } from './othersLogic';
import { useSetupFormat } from './itemFields';
import { SETUP_HOME, SetupItemFrame } from './SetupItemFrame';

const SAVED_KEY = 'decide.screens.sheetsHome.rule.savedToast';
const GROW = '/grow' as Href;

interface RuleRowModel {
  key: string;
  label: string;
  value: string;
  on: boolean;
  target: RuleTarget;
  /** What the switch does: write at once (null) or open the sheet because the rule has no value yet. */
  needsValue: boolean;
}

export function RulesSetup() {
  const t = useT();
  const router = useRouter();
  const { colors, pairing } = useTheme();
  const fmt = useSetupFormat();
  const rc = useRecordContext();
  const userId = rc.userId ?? '';
  const currency = rc.homeCurrency;
  const rules = useMoneyRules();
  const crossings = useRuleCrossings();
  const v3 = useDecideV3();
  const flags = useSetDecideAnswered(userId);
  const categories = useCategories(rc.userId ?? undefined).data;
  const categoryList = useMemo(() => (categories ?? []).map((c) => ({ id: c.id, name: c.name ?? '' })), [categories]);
  const categoryName = useCallback((id: string): string => categoryList.find((c) => c.id === id)?.name ?? '', [categoryList]);
  const [target, setTarget] = useState<RuleTarget | null>(null);
  const [adding, setAdding] = useState(false);
  const money = useCallback((minor: number): string => fmt.money(minor, currency), [fmt, currency]);
  const facts = useMemo(() => rulesFactsOf(v3.inputs), [v3.inputs]);

  const keep = rules.doc.rules.find((r) => r.kind === 'keep') ?? null;
  const largest = rules.doc.rules.find((r) => r.kind === 'largest') ?? null;
  const debtPercent = debtPercentOf(rules.dsrLine);
  const roomForOne = canAddRule(rules.doc);

  const rows: RuleRowModel[] = [
    {
      key: 'debt',
      label: t('decide.screens.setupOthers.rules.debtAtMost'),
      value: debtPercent === null ? t('decide.screens.setupOthers.rules.notSet') : t('decide.screens.setupOthers.rules.debtValue', { percent: String(debtPercent) }),
      on: debtPercent !== null,
      target: { kind: 'debt' },
      needsValue: false,
    },
    {
      key: 'keep',
      label: t('decide.screens.setupOthers.rules.keepAtLeast'),
      value: keep === null ? t('decide.screens.setupOthers.rules.notSet') : t('decide.screens.setupOthers.rules.keepValue', { amount: money(keep.value) }),
      on: keep !== null && keep.on,
      target: { kind: 'stored', rule: keep ?? newRule('keep') },
      needsValue: keep === null,
    },
    {
      key: 'largest',
      label: t('decide.screens.setupOthers.rules.largest'),
      value: largest === null ? t('decide.screens.setupOthers.rules.notSet') : money(largest.value),
      on: largest !== null && largest.on,
      target: { kind: 'stored', rule: largest ?? newRule('largest') },
      needsValue: largest === null,
    },
    ...rules.doc.rules
      .filter((r) => r.kind === 'category_cap' || r.kind === 'category_share')
      .map((r): RuleRowModel => ({
        key: r.id,
        label:
          r.kind === 'category_cap'
            ? t('decide.screens.sheetsHome.rulesCard.categoryAtMost', { category: categoryName(r.categoryId ?? ''), amount: money(r.value) })
            : t('decide.screens.sheetsHome.rulesCard.categoryShare', { category: categoryName(r.categoryId ?? ''), percent: String(r.value) }),
        value: r.on ? t('decide.screens.setupOthers.rules.on') : t('decide.screens.setupOthers.rules.off'),
        on: r.on,
        target: { kind: 'stored', rule: r },
        needsValue: false,
      })),
  ];

  const save = useCallback((patch: Parameters<typeof rules.save>[0], label: Parameters<typeof rules.save>[1]) => rules.save(patch, label), [rules]);

  const flip = (row: RuleRowModel): void => {
    if (row.needsValue) {
      if (roomForOne) setTarget(row.target);
      return;
    }
    if (row.target.kind === 'debt') {
      commitRule({ patch: { dsrLine: row.on ? null : String(DEBT_DEFAULT) }, label: 'ruleEdited', crossings, save, doneKey: SAVED_KEY });
    } else if (row.target.kind === 'stored') {
      const next: StoredRule = { ...row.target.rule, on: !row.on };
      commitRule({ patch: { doc: upsertRule(rules.doc, next) }, label: 'ruleEdited', crossings, save, doneKey: SAVED_KEY });
    }
  };

  const onCount = rulesOnCount(rules.dsrLine, rules.doc, v3.inputs === null ? null : v3.inputs.limits.lines.filter((l) => l.on).length);

  const leave = (): void => router.replace(SETUP_HOME);
  const saveRules = (): void => {
    if (userId === '') return;
    if (onCount === 0) {
      const done = flags.set({ flag: 'no_rules', on: true });
      showToast({ kind: 'ordinary', text: { key: 'decide.screens.setupOthers.rules.none' }, stepId: done?.stepId ?? null });
    } else {
      flags.set({ flag: 'no_rules', on: false, noUndo: true });
      showToast({ kind: 'ordinary', text: { key: 'decide.screens.setupOthers.rules.toast', params: { count: onCount } } });
    }
    router.replace(SETUP_HOME);
  };

  const small = { ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkMuted };
  return (
    <SetupItemFrame
      title={t('decide.screens.setupOthers.rules.title')}
      why={t('decide.screens.setupOthers.rules.why')}
      primaryLabel={t('decide.screens.setupOthers.rules.save')}
      primaryDisabled={userId === ''}
      onPrimary={saveRules}
      onBack={leave}
      onSaveAndClose={leave}
    >
      <View style={styles.list}>
        {rows.map((row) => (
          <View key={row.key} testID={`rule-${row.key}`} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line2 }]}>
            <ToggleRow label={row.label} value={row.on} onChange={() => flip(row)} />
            <View style={styles.chipRow}>
              <Chip
                label={row.value}
                accessibilityLabel={t('decide.screens.setupOthers.rules.changeA11y', { rule: `${row.label} ${row.value}` })}
                onPress={() => (row.needsValue && !roomForOne ? undefined : setTarget(row.target))}
              />
            </View>
          </View>
        ))}
      </View>
      <Pill variant="secondary" label={t('decide.screens.setupOthers.rules.addOwn')} disabled={!roomForOne} onPress={() => setAdding(true)} />
      {!roomForOne ? <Text style={small}>{t('decide.screens.setupOthers.rules.cap')}</Text> : null}
      {facts.saving !== null || facts.investing !== null ? (
        <View testID="rules-grow-note" style={styles.block}>
          <Text style={{ ...textRole(pairing, 'body'), color: colors.ink }}>
            {t('decide.screens.setupOthers.rules.growNote', { saving: money(facts.saving ?? 0), investing: money(facts.investing ?? 0) })}
          </Text>
          <Text style={small}>{t('decide.screens.setupOthers.rules.growNoteSub')}</Text>
        </View>
      ) : null}
      {onCount === 0 ? (
        <Text testID="rules-none" style={{ ...textRole(pairing, 'body'), color: colors.inkDim }}>
          {t('decide.screens.setupOthers.rules.none')}
        </Text>
      ) : null}

      <RuleEditSheet
        visible={target !== null}
        target={target}
        doc={rules.doc}
        dsrLine={rules.dsrLine}
        currency={currency}
        formatMoney={money}
        categoryName={categoryName}
        debtToday={null}
        usualLeft={null}
        crossings={crossings}
        save={rules.save}
        onOpenGrow={() => router.push(GROW)}
        onDismiss={() => setTarget(null)}
      />
      <AddRuleSheet visible={adding} doc={rules.doc} currency={currency} categories={categoryList} crossings={crossings} save={rules.save} onDismiss={() => setAdding(false)} />
    </SetupItemFrame>
  );
}

/** A rule that is not stored yet, opened in the edit sheet; saving it adds it to the document. */
function newRule(kind: 'keep' | 'largest'): StoredRule {
  return { id: `own_${kind}`, kind, on: true, value: 0, categoryId: null };
}

const styles = StyleSheet.create({
  list: { gap: space.gapMd },
  card: { borderRadius: radii.card, borderWidth: 1.5, paddingHorizontal: space.cardPad, paddingVertical: space.gapSm, gap: space.gapSm },
  chipRow: { flexDirection: 'row' },
  block: { gap: 2 },
});
