/**
 * 06.1-22 (D-19, D49): the Decide home "Your money rules" card. The first row is the safety net (a net tile with a lock glyph and
 * the word Locked or Unlocked) and opens the safety-net screen. Then the debt share, the regular saving and investing read from
 * Grow, and each rule the user set, each a 52+ high row. "+ Add your own rule" opens the add sheet. A rule is a rule, never a line.
 */
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useT } from '@/i18n';
import { radii, space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { stateColors } from '@/theme/tokens';
import { fontSize, textRole } from '@/theme/typography';
import { StateGlyph } from '@/ui/glyphs/StateGlyph';
import { hapticSelection } from '@/ui/haptics';
import { Text } from '@/ui/Text';
import { debtPercentOf, type StoredRule } from './homeCardsModel';

export type RuleTarget =
  | { readonly kind: 'debt' }
  | { readonly kind: 'saving'; readonly amount: number }
  | { readonly kind: 'investing'; readonly amount: number }
  | { readonly kind: 'stored'; readonly rule: StoredRule };

export interface MoneyRulesCardProps {
  /** null = no safety net recorded yet. */
  netLocked: boolean | null;
  dsrLine: string | null;
  rules: readonly StoredRule[];
  /** Regular saving and investing a month from Grow; null = none. */
  saving: number | null;
  investing: number | null;
  formatMoney: (minor: number) => string;
  categoryName: (id: string) => string;
  onOpenNet: () => void;
  onEdit: (target: RuleTarget) => void;
  onAdd: () => void;
}

function RuleRow({ label, state, last, onPress }: { label: string; state: string; last: boolean; onPress: () => void }) {
  const t = useT();
  const { colors, pairing } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('decide.screens.sheetsHome.rulesCard.ruleA11y', { rule: label, state })}
      onPress={() => {
        hapticSelection();
        onPress();
      }}
      style={({ pressed }) => [styles.row, { backgroundColor: pressed ? colors.fill6 : 'transparent', borderBottomColor: colors.line1, borderBottomWidth: last ? 0 : 1 }]}
    >
      <Text style={[styles.label, { ...textRole(pairing, 'body'), fontWeight: '500', color: colors.ink }]}>{label}</Text>
      <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, fontWeight: '600', color: colors.inkMuted }}>{state}</Text>
    </Pressable>
  );
}

export function MoneyRulesCard(props: MoneyRulesCardProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const on = t('decide.screens.sheetsHome.rulesCard.on');
  const off = t('decide.screens.sheetsHome.rulesCard.off');
  const net = stateColors.net;
  const netText = t(props.netLocked === false ? 'decide.screens.sheetsHome.rulesCard.netUnlocked' : 'decide.screens.sheetsHome.rulesCard.netLocked');

  const rows: { key: string; label: string; state: string; target: RuleTarget }[] = [];
  const debt = debtPercentOf(props.dsrLine);
  rows.push({
    key: 'debt',
    label: debt === null ? t('decide.screens.sheetsHome.rule.debt.title') : t('decide.screens.sheetsHome.rulesCard.debtAtMost', { percent: String(debt) }),
    state: debt === null ? off : on,
    target: { kind: 'debt' },
  });
  if (props.investing !== null) {
    rows.push({ key: 'investing', label: t('decide.screens.sheetsHome.rulesCard.investingAtLeast', { amount: props.formatMoney(props.investing) }), state: on, target: { kind: 'investing', amount: props.investing } });
  }
  if (props.saving !== null) {
    rows.push({ key: 'saving', label: t('decide.screens.sheetsHome.rulesCard.savingAtLeast', { amount: props.formatMoney(props.saving) }), state: on, target: { kind: 'saving', amount: props.saving } });
  }
  for (const rule of props.rules) {
    const amount = props.formatMoney(rule.value);
    const label =
      rule.kind === 'keep'
        ? t('decide.screens.sheetsHome.rulesCard.keepAtLeast', { amount })
        : rule.kind === 'largest'
          ? t('decide.screens.sheetsHome.rulesCard.largest', { amount })
          : rule.kind === 'category_cap'
            ? t('decide.screens.sheetsHome.rulesCard.categoryAtMost', { category: props.categoryName(rule.categoryId ?? ''), amount })
            : t('decide.screens.sheetsHome.rulesCard.categoryShare', { category: props.categoryName(rule.categoryId ?? ''), percent: String(rule.value) });
    rows.push({ key: rule.id, label, state: rule.on ? on : off, target: { kind: 'stored', rule } });
  }

  return (
    <View testID="money-rules-card" style={[styles.card, { backgroundColor: colors.surface }]}>
      <Text accessibilityRole="header" style={{ ...textRole(pairing, 'sheetTitle'), color: colors.ink }}>
        {t('decide.screens.sheetsHome.rulesCard.title')}
      </Text>
      <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkMuted }}>{t('decide.screens.sheetsHome.rulesCard.sub')}</Text>
      <Pressable
        testID="money-rules-net"
        accessibilityRole="button"
        accessibilityLabel={t('decide.screens.sheetsHome.rulesCard.netRowA11y', { state: netText })}
        onPress={() => {
          hapticSelection();
          props.onOpenNet();
        }}
        style={({ pressed }) => [styles.row, { backgroundColor: pressed ? colors.fill6 : 'transparent', borderBottomColor: colors.line1, borderBottomWidth: 1 }]}
      >
        <View style={[styles.tile, { backgroundColor: net.tint }]}>
          <StateGlyph name="lock" color={net.color} size={16} />
        </View>
        <View style={styles.label}>
          <Text style={{ ...textRole(pairing, 'body'), fontWeight: '500', color: colors.ink }}>{t('decide.screens.sheetsHome.rulesCard.net')}</Text>
          <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkMuted }}>{netText}</Text>
        </View>
      </Pressable>
      {rows.map((r) => (
        <RuleRow key={r.key} label={r.label} state={r.state} last={false} onPress={() => props.onEdit(r.target)} />
      ))}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('decide.screens.sheetsHome.rulesCard.addOwn')}
        onPress={() => {
          hapticSelection();
          props.onAdd();
        }}
        style={styles.add}
      >
        <Text style={{ ...textRole(pairing, 'label'), fontWeight: '600', color: colors.accent }}>{t('decide.screens.sheetsHome.rulesCard.addOwn')}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radii.card, paddingHorizontal: space.cardPad, paddingVertical: space.gapMd, gap: space.gapSm },
  row: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.gapMd, paddingVertical: space.gapSm },
  label: { flexShrink: 1, flexGrow: 1 },
  tile: { borderRadius: radii.glyphTile, padding: space.gapSm, alignItems: 'center', justifyContent: 'center' },
  add: { minHeight: space.touchMin, justifyContent: 'center' },
});
