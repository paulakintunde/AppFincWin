// 08-19 (HH-05, UI-SPEC Screen 4c): "How this is split". Four rules, who is in it, and a preview built only from the engine's
// splitLine (splitPreview.ts), so it always adds up to the total and shows what the server will store. By amount cannot be
// saved until nothing is left to assign.
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/ui/Text';
import { Pill } from '@/ui/Pill';
import { CheckRow } from '@/ui/CheckRow';
import { MoneyInput } from '@/ui/MoneyInput';
import { Sheet, SheetScroll } from '@/ui/Sheet';
import { SheetHeader } from '@/ui/SheetHeader';
import { Glyph } from '@/ui/icons/Glyph';
import { FadeIn } from '@/ui/motion/FadeIn';
import { hapticTap, hapticWarn } from '@/ui/haptics';
import { LINK_HIT_SLOP } from '@/ui/pressFeedback';
import { useSettledLabel } from '@/ui/useSettledLabel';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, space, step } from '@/theme/layout';
import { textRole } from '@/theme/typography';
import { useHouseholdMembers } from '@/data/queries/household';
import { MemberAvatar } from '../components/MemberAvatar';
import { SplitRuleList, type SplitRuleKey } from '../components/SplitRuleList';
import { WeightsSheet } from '../WeightsSheet';
import { useMemberLabel } from '../useMemberLabel';
import { splitPreview } from './splitPreview';
import { useSharingMoney } from './useSharingMoney';

export interface SplitValue {
  rule: SplitRuleKey;
  /** User ids ticked, in no particular order. */
  included: string[];
  /** Minor units per user id, used by By amount only. */
  amounts: Record<string, number>;
}

export interface SplitSheetProps {
  visible: boolean;
  householdId: string | null | undefined;
  /** The line's currency and its size as a positive number of minor units. Null: no amount typed yet. */
  currency: string;
  total: number | null;
  /** The household's reporting currency: By amount is typed in it, so it is offered only when the line is in it. */
  householdCurrency: string | null;
  payerId: string;
  value: SplitValue;
  onClose: () => void;
  onSave: (next: SplitValue) => void;
}

export function SplitSheet(props: SplitSheetProps) {
  if (!props.visible) return null;
  return <SplitBody {...props} />;
}

function SplitBody({ householdId, currency, total, householdCurrency, payerId, value, onClose, onSave }: SplitSheetProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const { data: members } = useHouseholdMembers(householdId);
  const label = useMemberLabel(householdId);
  const money = useSharingMoney(currency);
  const list = useMemo(() => members ?? [], [members]);
  const [rule, setRule] = useState<SplitRuleKey>(value.rule);
  const [included, setIncluded] = useState<Set<string>>(new Set(value.included));
  const [amounts, setAmounts] = useState<Record<string, number>>(value.amounts);
  const [weightsOpen, setWeightsOpen] = useState(false);

  const amountOffered = householdCurrency === null || householdCurrency === currency;
  const rules: SplitRuleKey[] = amountOffered ? ['even', 'weight', 'amount', 'mine'] : ['even', 'weight', 'mine'];

  const hasTotal = total !== null && total > 0;
  const totalMinor = total ?? 0;
  const preview = useMemo(
    () =>
      splitPreview(
        totalMinor,
        rule,
        list.map((m) => ({ userId: m.user_id, weight: m.weight })),
        included,
        payerId,
        amounts,
      ),
    [totalMinor, rule, list, included, payerId, amounts],
  );

  // With no amount typed yet the split is only a choice of rule and people; the figures wait for an amount.
  const valid = hasTotal ? preview.addsUp : rule !== 'amount' && preview.reason === null;
  const title = t('household.rules.splitTitle');

  // D-56 a11y: the total is a polite live region that speaks once the figures stop moving.
  const totalWords = hasTotal ? t('household.rules.addsUp', { amount: money(totalMinor) }) : t('household.sharing.splitMissing');
  const leftWords = t('household.rules.leftToAssign', { amount: money(preview.leftToAssign) });
  const spoken = useSettledLabel(rule === 'amount' && !preview.addsUp ? leftWords : totalWords, preview.addsUp ? 'ok' : 'warn', 600);

  const toggle = (id: string) => {
    setIncluded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const submit = () => {
    if (!valid) {
      hapticWarn();
      return;
    }
    hapticTap();
    onSave({ rule, included: Array.from(included), amounts: rule === 'amount' ? amounts : {} });
  };

  const reasonWords =
    preview.reason === 'no_other_member'
      ? t('household.sharing.noOtherMember')
      : preview.reason === 'split_weights_zero'
        ? t('household.sharing.splitWeightsZero')
        : null;

  return (
    <Sheet visible onDismiss={onClose} accessibilityLabel={title}>
      <SheetHeader title={title} cancelLabel={t('record.sheet.cancel')} onCancel={onClose} />
      <SheetScroll contentContainerStyle={styles.column}>
        <SplitRuleList
          value={rule}
          rules={rules}
          onChange={(next) => {
            setRule(next);
            // The other rules start with everyone in; Mine only leaves the others out.
            if (next !== 'mine' && included.size < 2) setIncluded(new Set(list.map((m) => m.user_id)));
          }}
        />

        {rule !== 'mine' ? (
          <View>
            <Text accessibilityRole="header" style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>
              {t('household.rules.whosInIt')}
            </Text>
            {list.map((m) => (
              <View key={m.user_id} style={styles.who}>
                <MemberAvatar householdId={householdId} userId={m.user_id} size={28} />
                <View style={styles.whoRow}>
                  <CheckRow
                    checked={included.has(m.user_id)}
                    onToggle={() => toggle(m.user_id)}
                    name={label(m.user_id)}
                    amount=""
                    removeA11yLabel=""
                  />
                </View>
              </View>
            ))}
          </View>
        ) : null}

        {rule === 'weight' ? (
          <View testID="split-weights">
            <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>{t('household.rules.weightsReadOnly')}</Text>
            {list.map((m) => (
              <Text key={m.user_id} style={{ ...textRole(pairing, 'body'), color: colors.ink }}>
                {t('household.sharing.weightLine', { name: label(m.user_id), percent: m.weight })}
              </Text>
            ))}
            <Pressable
              accessibilityRole="link"
              accessibilityLabel={t('household.rules.changeWeights')}
              hitSlop={LINK_HIT_SLOP}
              onPress={() => setWeightsOpen(true)}
              style={styles.link}
              testID="split-change-weights"
            >
              <Text style={{ ...textRole(pairing, 'label'), color: colors.accent }}>{t('household.rules.changeWeights')}</Text>
            </Pressable>
          </View>
        ) : null}

        {rule === 'amount'
          ? list
              .filter((m) => included.has(m.user_id))
              .map((m) => (
                <MoneyInput
                  key={m.user_id}
                  value={amounts[m.user_id] ?? null}
                  currency={currency}
                  label={label(m.user_id)}
                  accessibilityLabel={t('household.sharing.amountFor', { name: label(m.user_id) })}
                  onChange={(minor) => setAmounts((prev) => ({ ...prev, [m.user_id]: minor ?? 0 }))}
                  compact
                />
              ))
          : null}

        <View style={[styles.card, { backgroundColor: colors.fill1 }]} testID="split-preview">
          {hasTotal
            ? preview.rows.map((r) => (
                <View key={r.userId} style={styles.previewRow}>
                  <Text style={{ ...textRole(pairing, 'body'), color: colors.ink, flex: 1 }}>{label(r.userId)}</Text>
                  <Text style={{ ...textRole(pairing, 'body'), color: colors.ink }}>{money(r.amount)}</Text>
                </View>
              ))
            : null}
          <View accessibilityLiveRegion="polite" accessible accessibilityLabel={spoken}>
            <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>{totalWords}</Text>
          </View>
        </View>

        {rule === 'amount' && hasTotal && !preview.addsUp && preview.reason === 'amounts_not_total' ? (
          <FadeIn>
            <View style={styles.warn} testID="split-left">
              <Glyph name="stateTight" size={16} color={colors.warn1} />
              <Text style={{ ...textRole(pairing, 'label'), color: colors.warn1, flexShrink: 1 }}>{leftWords}</Text>
            </View>
          </FadeIn>
        ) : null}
        {reasonWords ? (
          <Text accessibilityRole="alert" style={{ ...textRole(pairing, 'label'), color: colors.warn1 }} testID="split-reason">
            {reasonWords}
          </Text>
        ) : null}

        <Pill label={t('household.rules.saveSplit')} variant="primary" onPress={submit} />
      </SheetScroll>
      <WeightsSheet visible={weightsOpen} householdId={householdId} onClose={() => setWeightsOpen(false)} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  column: { gap: step.row },
  who: { flexDirection: 'row', alignItems: 'center', gap: step.tight },
  whoRow: { flex: 1 },
  card: { borderRadius: radii.card, padding: step.card, gap: step.tight },
  previewRow: { flexDirection: 'row', alignItems: 'center', gap: step.row },
  warn: { flexDirection: 'row', alignItems: 'center', gap: step.hair },
  link: { minHeight: space.touchMin, justifyContent: 'center' },
});
