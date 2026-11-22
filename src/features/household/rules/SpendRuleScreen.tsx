// 08.1-23 (CMP-F19, owner 2026-11-21 Q1-Q6): "How spending is shared". One screen holds the household's setup (Separate accounts,
// One joint account, Mixed) and its spending rule (What each person brings, A set spending split, Same as the bill split). Any member
// may save (22 Q2); the server names the change in Notices and the toast offers Undo. No maths here: plan 22's engine reads the rule.
//   Q4: with no rule ever picked, the rule follows the setup's default; a picked rule stays and the setup's default is only tagged.
//   Q5: the set-shares editor starts from saved shares that still fit, else the bill split's percents; each share also shows what it
//       means in money when this month's shared money is known (never a made-up amount).
//   Q6: out-of-date shares say so, with "Update shares" opening the editor.
// 08.1-25 (owner one-earner fix 2026-11-21, Q3 A): when the saved rule gives a member a $0 share of the joint money, a card names them
// and offers the suggestion (zeroShareSuggestion.ts); its button, or opening with `suggest`, picks A set spending split and opens the
// editor pre-filled. Save stays the only writer: the app never switches the rule on its own.
import React, { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { Text } from '@/ui/Text';
import { Screen } from '@/ui/Screen';
import { Pill } from '@/ui/Pill';
import { WarningCard } from '@/ui/WarningCard';
import { StatusBadge } from '@/ui/status/StatusBadge';
import { Glyph } from '@/ui/icons/Glyph';
import { BackButton } from '@/shell/header/BackButton';
import { useBackHistory } from '@/shell/backHistory/BackHistoryProvider';
import { hapticFailed, hapticTap, hapticWarn } from '@/ui/haptics';
import { useMoneyFormatter } from '@/ui/money/useMoneyFormatter';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, space, step } from '@/theme/layout';
import { textRole } from '@/theme/typography';
import { queryKeys } from '@/data/keys';
import { setHouseholdSpendRule, type HouseholdSpendRuleRow } from '@/db/householdSpendRules';
import { defaultRuleFor, type HouseholdSetup, type SpendRuleKind } from '@/engine/household';
import { rebalanceWeights } from '@/engine/household/weights';
import { money } from '@/engine/money';
import { supabase } from '@/services/supabase';
import { showToast } from '@/state/undoToast';
import { ChoiceList, type Choice } from '../components/ChoiceList';
import { ExplainTip } from '../components/ExplainTip';
import { WeightRow } from '../components/WeightRow';
import { useHouseholdScope } from '../useHouseholdScope';
import { useMemberLabel } from '../useMemberLabel';
import { RULES, SETUPS, moneyParts, sharesFit, startingShares } from './spendRuleView';
import { useSharedMoney } from './useSharedMoney';
import { useSpendRule } from './useSpendRule';
import { useZeroShare } from './useZeroShare';
import { ZERO_SHARE_SUGGESTION, currentSuggestion, suggestionFor, type SuggestionTarget } from './zeroShareSuggestion';

type Before = Pick<HouseholdSpendRuleRow, 'rule' | 'setup' | 'shares'>;

export function SpendRuleScreen({ suggest }: { readonly suggest?: SuggestionTarget | undefined } = {}) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const qc = useQueryClient();
  const { goBack } = useBackHistory();
  const { householdId, userId, online } = useHouseholdScope();
  const read = useSpendRule(householdId, userId);
  const { members, row, view, defaults } = read;
  const label = useMemberLabel(householdId);
  const ids = useMemo(() => members.map((m) => m.user_id), [members]);
  const otherIds = useMemo(() => ids.filter((id) => id !== userId), [ids, userId]);
  const shared = useSharedMoney(householdId, userId, otherIds);
  const whole = useMoneyFormatter(false);

  const [pickedSetup, setPickedSetup] = useState<HouseholdSetup | null>(null);
  const [pickedRule, setPickedRule] = useState<SpendRuleKind | null>(null);
  const [edited, setEdited] = useState<readonly number[] | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [lastHolder, setLastHolder] = useState(false);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [conflict, setConflict] = useState<{ by: string | null } | null>(null);
  const zero = useZeroShare(householdId, members, row, defaults, view?.setup ?? null);

  // 08.1-25: the suggestion fills the editor; it never saves.
  const openSuggestion = (target: SuggestionTarget) => {
    setConflict(null);
    setFailure(null);
    setLastHolder(false);
    setPickedRule('custom');
    setEdited(suggestionFor(target).prefill(members.length));
    setEditorOpen(true);
  };
  // Opened with ?suggest=: once the members are known, the same as pressing the card's button (state adjusted during render).
  const [suggestDone, setSuggestDone] = useState(false);
  if (suggest !== undefined && !suggestDone && members.length >= 2 && view !== null) {
    setSuggestDone(true);
    openSuggestion(suggest);
  }

  const refresh = () => (householdId ? qc.invalidateQueries({ queryKey: queryKeys.householdSpendRule(householdId) }) : Promise.resolve());

  if (members.length < 2 || view === null) {
    return (
      <Screen scroll>
        <View style={styles.back}>
          <BackButton variant="compact" onPress={goBack} />
        </View>
        <Text accessibilityRole="header" style={{ ...textRole(pairing, 'heading'), color: colors.ink }}>
          {t('household.rules.spending.title')}
        </Text>
      </Screen>
    );
  }

  const setup = pickedSetup ?? view.setup;
  // Q4: a rule nobody picked follows the setup's default.
  const rule: SpendRuleKind = pickedRule ?? row?.rule ?? defaultRuleFor(setup);
  const setupDefault = defaultRuleFor(setup);
  const savedFit = row?.shares != null && sharesFit(row.shares, ids) ? ids.map((id) => row.shares?.[id] ?? 0) : null;
  const weights = edited ?? startingShares(row, members, defaults);
  const total = weights.reduce((a, b) => a + b, 0);
  const sharesValid = total === 100 && weights.some((w) => w > 0);
  const outOfDate = view.outOfDate && pickedRule === null && edited === null;
  const showEditor = rule === 'custom' && (!view.outOfDate || editorOpen || pickedRule === 'custom' || edited !== null);

  const setupChanged = pickedSetup !== null && pickedSetup !== (row?.setup ?? null);
  const ruleChanged = pickedRule !== null && pickedRule !== (row?.rule ?? null);
  const sharesChanged = rule === 'custom' && (savedFit === null || weights.some((w, i) => w !== savedFit[i]));
  const changed = setupChanged || ruleChanged || sharesChanged;
  const canSave = changed && (rule !== 'custom' || sharesValid);

  const billRuleName = t(`household.rules.names.${defaults?.find((d) => d.category_ref === null)?.rule === 'weight' ? 'weight' : 'even'}`);
  const setupChoices: Choice<HouseholdSetup>[] = SETUPS.map((s) => ({
    key: s,
    label: t(`household.rules.spending.setup.${s}.label`),
    helper: t(`household.rules.spending.setup.${s}.helper`),
    tag: s === setup && pickedSetup === null && view.setupInferred ? t('household.rules.spending.setup.inferred') : null,
    tip: t(`household.rules.spending.setup.${s}.tip`),
  }));
  const ruleChoices: Choice<SpendRuleKind>[] = RULES.map((r) => ({
    key: r,
    label: t(`household.rules.spending.${r}.label`),
    helper: r === 'bill' ? t('household.rules.spending.bill.helper', { rule: billRuleName }) : t(`household.rules.spending.${r}.helper`),
    tag: r === setupDefault ? t('household.rules.spending.defaultTag') : null,
    tip: t(`household.rules.spending.${r}.tip`),
  }));

  const parts = moneyParts(shared.total, weights);
  const totalText = shared.total !== null && shared.currency !== null && parts !== null ? whole.formatMoney(money(shared.total, shared.currency)) : null;

  const change = (index: number, next: number) => {
    setFailure(null);
    const result = rebalanceWeights(weights, index, next);
    if (!result.ok) {
      setLastHolder(true);
      hapticWarn();
      return;
    }
    setLastHolder(false);
    setEdited(result.weights);
  };

  const save = async () => {
    if (saving || householdId == null || !canSave) return;
    if (!online) {
      setFailure(t('household.rules.needsConnection'));
      return;
    }
    setSaving(true);
    setFailure(null);
    setConflict(null);
    const before: Before | null = row === null ? null : { rule: row.rule, setup: row.setup, shares: row.shares };
    try {
      const res = await setHouseholdSpendRule(supabase, {
        rule: pickedRule ?? row?.rule ?? null,
        setup: pickedSetup ?? row?.setup ?? null,
        shares: rule === 'custom' ? Object.fromEntries(ids.map((id, i) => [id, weights[i] ?? 0])) : null,
        expectedVersion: row?.version ?? null,
      });
      if (!res.ok) {
        hapticFailed();
        if (res.reason === 'version_conflict') {
          setConflict({ by: typeof res.updated_by === 'string' ? res.updated_by : null });
          setPickedSetup(null);
          setPickedRule(null);
          setEdited(null);
          await refresh();
        } else {
          setFailure(res.reason === 'members_mismatch' ? t('household.members.reasons.members_mismatch') : t('household.rules.failed'));
        }
        return;
      }
      hapticTap();
      const version = res.version;
      showToast({
        kind: 'ordinary',
        text: { key: 'household.rules.spending.saved' },
        onUndo: () => {
          void setHouseholdSpendRule(supabase, {
            rule: before?.rule ?? null,
            setup: before?.setup ?? null,
            shares: before?.rule === 'custom' ? before.shares : null,
            expectedVersion: typeof version === 'number' ? version : null,
          }).then(() => refresh());
        },
      });
      setPickedSetup(null);
      setPickedRule(null);
      setEdited(null);
      setEditorOpen(false);
      await refresh();
    } catch {
      hapticFailed();
      setFailure(t('household.rules.failed'));
    } finally {
      setSaving(false);
    }
  };

  const muted = { ...textRole(pairing, 'label'), color: colors.inkMuted };
  const card = [styles.card, { backgroundColor: colors.surface }];

  // 08.1-25 (Q3 A): every member sees the card, which names the person; it cannot be put away and goes once the rule changes or the
  // share is above $0. Not shown while A set spending split is picked (the editor is the suggestion).
  const suggestion = currentSuggestion();
  const say = t as unknown as (key: string, values?: Readonly<Record<string, string | number>>) => string;
  const zeroText = zero.currency === null ? null : whole.formatMoney(money(0, zero.currency));
  const zeroLine = (): string | null => {
    if (zeroText === null || zero.ids.length === 0) return null;
    if (zero.ids.length === 1) {
      const only = zero.ids[0] as string;
      return only === userId ? say(suggestion.settingsYouKey, { zero: zeroText }) : say(suggestion.settingsKey, { name: label(only), zero: zeroText });
    }
    const names = zero.ids.map((id) => label(id));
    const joined = say('decide.screens.answer.caveat.nameAnd', { a: names.slice(0, -1).join(', '), b: names[names.length - 1] as string });
    return say(suggestion.settingsManyKey, { names: joined, zero: zeroText });
  };
  const savedCounts = view.counted === 'bring' || view.counted === 'bill';
  const zeroCard = savedCounts && rule !== 'custom' ? zeroLine() : null;

  return (
    <Screen scroll>
      <View style={styles.back}>
        <BackButton variant="compact" onPress={goBack} />
      </View>
      <Text accessibilityRole="header" style={{ ...textRole(pairing, 'heading'), color: colors.ink }}>
        {t('household.rules.spending.title')}
      </Text>
      <Text style={[muted, styles.intro]}>{t('household.rules.spending.intro')}</Text>

      <View style={card}>
        <Text accessibilityRole="header" style={{ ...textRole(pairing, 'bodyStrong'), color: colors.ink }}>
          {t('household.rules.spending.setup.label')}
        </Text>
        <ChoiceList
          value={setup}
          choices={setupChoices}
          onChange={(s) => {
            setConflict(null);
            setPickedSetup(s);
          }}
          accessibilityLabel={t('household.rules.spending.setup.label')}
          testIDPrefix="spend-setup"
        />
      </View>

      <View style={card}>
        <Text accessibilityRole="header" style={{ ...textRole(pairing, 'bodyStrong'), color: colors.ink }}>
          {t('household.rules.spending.ruleLabel')}
        </Text>
        <ChoiceList
          value={rule}
          choices={ruleChoices}
          onChange={(r) => {
            setConflict(null);
            setPickedRule(r);
          }}
          accessibilityLabel={t('household.rules.spending.ruleLabel')}
          testIDPrefix="spend-rule"
        />
        {outOfDate ? (
          <View testID="spend-out-of-date" style={[styles.warnBox, { backgroundColor: colors.fill1 }]}>
            <View style={styles.warn}>
              <Glyph name="stateTight" size={16} color={colors.warn1} />
              <Text style={{ ...textRole(pairing, 'label'), color: colors.ink, flexShrink: 1 }}>{t('household.rules.spending.outOfDate')}</Text>
            </View>
            <ExplainTip name={t('household.rules.spending.needsUpdating')} text={t('household.rules.spending.outOfDateTip')} testID="spend-out-of-date-tip" />
            {showEditor ? null : <Pill label={t('household.rules.spending.update')} variant="secondary" onPress={() => setEditorOpen(true)} />}
          </View>
        ) : null}
      </View>

      {zeroCard !== null ? (
        <View style={card} testID="spend-zero-share">
          <Text style={{ ...textRole(pairing, 'label'), color: colors.ink }}>{zeroCard}</Text>
          <Pill
            label={say(suggestion.actionKey)}
            variant="secondary"
            onPress={() => {
              hapticTap();
              openSuggestion(ZERO_SHARE_SUGGESTION);
            }}
          />
        </View>
      ) : null}

      {showEditor ? (
        <View style={card} testID="spend-shares">
          <Text accessibilityRole="header" style={{ ...textRole(pairing, 'bodyStrong'), color: colors.ink }}>
            {t('household.rules.spending.shares.title')}
          </Text>
          <ExplainTip name={t('household.rules.spending.shares.title')} text={t('household.rules.spending.shares.tip')} testID="spend-shares-tip" />
          {ids.map((id, i) => (
            <View key={id}>
              <WeightRow householdId={householdId} userId={id} percent={weights[i] ?? 0} onChange={(n) => change(i, n)} />
              {parts !== null && totalText !== null && shared.currency !== null ? (
                <Text testID={`spend-share-money-${id}`} style={muted}>
                  {t('household.rules.spending.shares.money', {
                    percent: weights[i] ?? 0,
                    amount: whole.formatMoney(money(parts[i] ?? 0, shared.currency)),
                    total: totalText,
                  })}
                </Text>
              ) : null}
            </View>
          ))}
          <View accessibilityLiveRegion="polite" style={styles.total}>
            {sharesValid ? (
              <StatusBadge status="paid" label={t('household.rules.spending.shares.total', { total })} testID="spend-shares-total" />
            ) : (
              <View style={styles.warn} testID="spend-shares-not-100">
                <Glyph name="stateTight" size={16} color={colors.warn1} />
                <Text style={{ ...textRole(pairing, 'label'), color: colors.warn1, flexShrink: 1 }}>
                  {t('household.rules.spending.shares.notHundred', { total })}
                </Text>
              </View>
            )}
          </View>
          {lastHolder ? (
            <Text testID="spend-last-holder" style={{ ...textRole(pairing, 'label'), color: colors.warn1 }}>
              {t('household.members.weights.lastHolder')}
            </Text>
          ) : null}
        </View>
      ) : null}

      <View style={styles.column}>
        {conflict ? (
          <View testID="spend-conflict">
            <WarningCard
              tone="soft"
              title={conflict.by ? t('household.rules.spending.conflict', { name: label(conflict.by) }) : t('household.rules.spending.conflictNoName')}
              value=""
              body={[]}
            />
          </View>
        ) : null}
        {failure ? (
          <Text accessibilityRole="alert" testID="spend-failure" style={{ ...textRole(pairing, 'label'), color: colors.danger }}>
            {failure}
          </Text>
        ) : null}
        {!online ? <Text style={muted}>{t('household.home.offline.helper')}</Text> : null}
        <Pill label={t('household.rules.spending.save')} variant="primary" onPress={() => void save()} disabled={!canSave || !online} pending={saving} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  back: { marginBottom: space.gapMd },
  intro: { marginTop: step.tight },
  card: { marginTop: step.section, padding: step.card, borderRadius: radii.card, gap: step.tight },
  column: { marginTop: step.section, gap: step.row },
  warnBox: { padding: step.row, borderRadius: radii.card / 2, gap: step.hair },
  warn: { flexDirection: 'row', alignItems: 'center', gap: step.hair },
  total: { paddingVertical: step.tight },
});
