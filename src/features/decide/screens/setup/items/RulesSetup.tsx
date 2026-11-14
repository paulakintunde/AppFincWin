// 06.1-25 (D36, D-19): setup item 5, Your money rules. Each rule is a switch row with a value chip that opens the same edit sheet the
// Decide home card uses (plan 22). Rules are stored once, where plan 22 put them: the debt share in decide_settings.dsr_line and the
// rest as the rules document under custom_options.rules (useMoneyRules). Nothing new is stored here except the D-23 "no rules" flag.
//
//  - Switching a rule on or off, and every sheet save, write at once (one Undo each), through commitRule.
//  - Keep at least and Largest single purchase have no value until the person gives one, so their switch opens the sheet.
//  - Saving the rules with all of them off sets the no-rules flag, says "No rules. Answers still keep your safety net.", and keeps
//    the item ticked; any rule on clears the flag.
//  - Saving and investing at least are the person's regular saving series in Grow. 06.1-79 (DS-8, OQ-79-1 A): they show as rules
//    set in Grow, the same rows as Decide home's card (rulesShown), with a link to Grow and no switch; they count as rules on.
//  - 06.1-65 (CB-15): at the five-rule cap, the value chip of a rule not stored yet is disabled and the cap line sits under it.
//    (CF-9): the "N rules on" toast carries the step id of the no-rules clear, so it has Undo like every other setup toast.
import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { useT } from '@/i18n';
import { useSetDecideAnswered } from '@/data/mutations/decideSetup';
import { useCategories } from '@/data/queries/categories';
import { useDecideV3 } from '@/data/queries/decideV3';
import { useRecordContext } from '@/features/record/useRecordContext';
import { showToast } from '@/state/undoToast';
import { PRESSED_OPACITY, radii, space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { fontSize, textRole } from '@/theme/typography';
import { Chip } from '@/ui/Chip';
import { Pill } from '@/ui/Pill';
import { Text } from '@/ui/Text';
import { ToggleRow } from '@/ui/ToggleRow';
import { AddRuleSheet } from '../../home/AddRuleSheet';
import { commitRule } from '../../home/commitRule';
import { canAddRule, DEBT_DEFAULT, debtPercentOf, kindTaken, upsertRule, type StoredRule } from '../../home/homeCardsModel';
import type { RuleTarget } from '../../home/MoneyRulesCard';
import { RuleEditSheet } from '../../home/RuleEditSheet';
import { useMoneyRules, useRuleCrossings } from '../../home/useHomeCards';
import { rulesFactsOf } from '../../home/useHomeFacts';
import { rulesOnOf, rulesShown, shownOnCount } from '../../logic/rulesShown';
import { rulesOnCount } from './othersLogic';
import { useSetupFormat } from './itemFields';
import { SetupItemFrame, useLeaveItem } from './SetupItemFrame';

const SAVED_KEY = 'decide.screens.sheetsHome.rule.savedToast';
const GROW = '/grow' as Href;

interface GrowRowModel {
  key: 'saving' | 'investing';
  label: string;
  value: string;
}

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
  const leave = useLeaveItem();
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

  const debtPercent = debtPercentOf(rules.dsrLine);
  const roomForOne = canAddRule(rules.doc);
  // 06.1-79 (DS-8, OQ-79-1 A): the same rules, in the same order, as Decide home's rules card. Grow's saving and investing show as
  // rules set in Grow (no switch here; a link opens Grow). Keep at least and Largest single purchase also show as "Not set" rows
  // until the person gives them a value, so they can be switched on from here.
  const shown = rulesShown({ debtPercent, rules: rules.doc.rules, saving: facts.saving, investing: facts.investing });
  const ownRow = (r: StoredRule): RuleRowModel => {
    const kindKey = r.kind === 'keep' || r.kind === 'largest' ? r.kind : r.id;
    const label =
      r.kind === 'keep'
        ? t('decide.screens.setupOthers.rules.keepAtLeast')
        : r.kind === 'largest'
          ? t('decide.screens.setupOthers.rules.largest')
          : r.kind === 'category_cap'
            ? t('decide.screens.sheetsHome.rulesCard.categoryAtMost', { category: categoryName(r.categoryId ?? ''), amount: money(r.value) })
            : t('decide.screens.sheetsHome.rulesCard.categoryShare', { category: categoryName(r.categoryId ?? ''), percent: String(r.value) });
    const value =
      r.kind === 'keep'
        ? t('decide.screens.setupOthers.rules.keepValue', { amount: money(r.value) })
        : r.kind === 'largest'
          ? money(r.value)
          : r.on
            ? t('decide.screens.setupOthers.rules.on')
            : t('decide.screens.setupOthers.rules.off');
    return { key: kindKey, label, value, on: r.on, target: { kind: 'stored', rule: r }, needsValue: false };
  };
  const notSetRow = (kind: 'keep' | 'largest'): RuleRowModel => ({
    key: kind,
    label: t(kind === 'keep' ? 'decide.screens.setupOthers.rules.keepAtLeast' : 'decide.screens.setupOthers.rules.largest'),
    value: t('decide.screens.setupOthers.rules.notSet'),
    on: false,
    target: { kind: 'stored', rule: newRule(kind) },
    needsValue: true,
  });
  const rows: RuleRowModel[] = [];
  const growRows: GrowRowModel[] = [];
  for (const r of shown) {
    if (r.kind === 'debt') {
      rows.push({
        key: 'debt',
        label: t('decide.screens.setupOthers.rules.debtAtMost'),
        value: r.percent === null ? t('decide.screens.setupOthers.rules.notSet') : t('decide.screens.setupOthers.rules.debtValue', { percent: String(r.percent) }),
        on: r.on,
        target: { kind: 'debt' },
        needsValue: false,
      });
    } else if (r.kind === 'saving' || r.kind === 'investing') {
      growRows.push({ key: r.key, label: t(r.kind === 'saving' ? 'decide.screens.sheetsHome.rule.saving.title' : 'decide.screens.sheetsHome.rule.investing.title'), value: money(r.amount) });
    } else {
      rows.push(ownRow(r.rule));
    }
  }
  if (!kindTaken(rules.doc, 'keep')) rows.push(notSetRow('keep'));
  if (!kindTaken(rules.doc, 'largest')) rows.push(notSetRow('largest'));

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

  const onCount = rulesOnCount(shownOnCount(shown), v3.inputs === null ? null : rulesOnOf(v3.inputs));

  // 06.1-65: every switch and sheet writes at once, so nothing on this page is left unsaved and "Save and close" just closes.
  const saveRules = (): boolean => {
    if (userId === '') return false;
    if (onCount === 0) {
      const done = flags.set({ flag: 'no_rules', on: true });
      showToast({ kind: 'ordinary', text: { key: 'decide.screens.setupOthers.rules.none' }, stepId: done?.stepId ?? null });
    } else {
      // CF-9: the clear is its own Undo step (null, and no Undo, when the flag was already clear and nothing was written).
      const cleared = flags.set({ flag: 'no_rules', on: false });
      showToast({ kind: 'ordinary', text: { key: 'decide.screens.setupOthers.rules.toast', params: { count: onCount } }, stepId: cleared?.stepId ?? null });
    }
    return true;
  };

  const small = { ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkMuted };
  return (
    <SetupItemFrame
      title={t('decide.screens.setupOthers.rules.title')}
      why={t('decide.screens.setupOthers.rules.why')}
      primaryLabel={t('decide.screens.setupOthers.rules.save')}
      primaryDisabled={userId === ''}
      onSave={saveRules}
      onLeave={leave}
    >
      <View style={styles.list}>
        {rows.map((row) => {
          // CB-15: a rule with no value yet cannot be added at the cap, so its chip is off and the reason sits right under it.
          const capped = row.needsValue && !roomForOne;
          return (
            <View key={row.key} testID={`rule-${row.key}`} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line2 }]}>
              <ToggleRow label={row.label} value={row.on} onChange={() => flip(row)} />
              <View style={styles.chipRow}>
                <Chip
                  label={row.value}
                  accessibilityLabel={t('decide.screens.setupOthers.rules.changeA11y', { rule: `${row.label} ${row.value}` })}
                  disabled={capped}
                  onPress={() => setTarget(row.target)}
                />
              </View>
              {capped ? (
                <Text testID={`rule-cap-${row.key}`} style={small}>
                  {t('decide.screens.setupOthers.rules.capBeside')}
                </Text>
              ) : null}
            </View>
          );
        })}
      </View>
      <Pill variant="secondary" label={t('decide.screens.setupOthers.rules.addOwn')} disabled={!roomForOne} onPress={() => setAdding(true)} />
      {!roomForOne ? <Text style={small}>{t('decide.screens.setupOthers.rules.cap')}</Text> : null}
      {growRows.map((g) => (
        <View key={g.key} testID={`rule-${g.key}`} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line2 }]}>
          <View style={styles.growHead}>
            <Text style={{ ...textRole(pairing, 'body'), color: colors.ink, flexShrink: 1 }}>{g.label}</Text>
            <Text style={{ ...textRole(pairing, 'bodyStrong'), color: colors.ink, fontVariant: ['tabular-nums'] }}>{g.value}</Text>
          </View>
          <Text testID={`rule-${g.key}-from-grow`} style={small}>
            {t('decide.screens.setupOthers.rules.fromGrow')}
          </Text>
          <Pressable
            testID={`rule-${g.key}-open-grow`}
            accessibilityRole="link"
            accessibilityLabel={t(g.key === 'saving' ? 'decide.screens.sheetsHome.rule.saving.open' : 'decide.screens.sheetsHome.rule.investing.open')}
            onPress={() => router.push(GROW)}
            style={({ pressed }) => [styles.link, { opacity: pressed ? PRESSED_OPACITY : 1 }]}
          >
            <Text style={{ ...textRole(pairing, 'label'), color: colors.ink, textDecorationLine: 'underline' }}>
              {t(g.key === 'saving' ? 'decide.screens.sheetsHome.rule.saving.open' : 'decide.screens.sheetsHome.rule.investing.open')}
            </Text>
          </Pressable>
        </View>
      ))}
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
  growHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.gapMd },
  link: { minHeight: space.touchMin, justifyContent: 'center' },
});
