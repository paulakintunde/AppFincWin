/**
 * 06.1-22 (D-19, D49): the Decide home "Your money rules" card. The first row is the safety net (a net tile with a lock glyph and
 * the word Locked or Unlocked) and opens the safety-net screen. Then the debt share, the regular saving and investing read from
 * Grow, and each rule the user set, each a 52+ high row. "+ Add your own rule" opens the add sheet. A rule is a rule, never a line.
 * 06.1-56 (A-HOME-8): each row is the rule's name over a short sub-line, with its own figure at the right ("36%", "$200"). On or
 * Off is in the spoken label only; a rule that is off draws its figure in the faint ink.
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

interface RuleRowModel {
  key: string;
  title: string;
  sub: string;
  /** The rule's own figure ("36%", "$200"); null when the rule has none (the debt share switched off). */
  value: string | null;
  on: boolean;
  target: RuleTarget;
}

function RuleRow({ row, last, onPress }: { row: RuleRowModel; last: boolean; onPress: () => void }) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const state = t(row.on ? 'decide.screens.sheetsHome.rulesCard.on' : 'decide.screens.sheetsHome.rulesCard.off');
  const spokenRule = row.value === null ? row.title : `${row.title}, ${row.value}`;
  return (
    <Pressable
      testID={`money-rule-${row.key}`}
      accessibilityRole="button"
      accessibilityLabel={t('decide.screens.sheetsHome.rulesCard.ruleA11y', { rule: spokenRule, state })}
      onPress={() => {
        hapticSelection();
        onPress();
      }}
      style={({ pressed }) => [styles.row, { backgroundColor: pressed ? colors.fill6 : 'transparent', borderBottomColor: colors.line1, borderBottomWidth: last ? 0 : 1 }]}
    >
      <View style={styles.label}>
        <Text style={{ ...textRole(pairing, 'body'), fontWeight: '500', color: colors.ink }}>{row.title}</Text>
        <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkMuted }}>{row.sub}</Text>
      </View>
      {row.value === null ? null : (
        <Text testID={`money-rule-value-${row.key}`} style={{ ...textRole(pairing, 'bodyStrong'), color: row.on ? colors.ink : colors.inkFaint, fontVariant: ['tabular-nums'] }}>
          {row.value}
        </Text>
      )}
    </Pressable>
  );
}

export function MoneyRulesCard(props: MoneyRulesCardProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const net = stateColors.net;
  const netText = t(props.netLocked === false ? 'decide.screens.sheetsHome.rulesCard.netUnlocked' : 'decide.screens.sheetsHome.rulesCard.netLocked');

  const pct = (n: number): string => t('decide.screens.sheetsHome.rulesCard.percentValue', { percent: String(n) });
  const rows: RuleRowModel[] = [];
  const debt = debtPercentOf(props.dsrLine);
  rows.push({
    key: 'debt',
    title: t('decide.screens.sheetsHome.rule.debt.title'),
    sub: t('decide.screens.sheetsHome.rule.debt.sub'),
    value: debt === null ? null : pct(debt),
    on: debt !== null,
    target: { kind: 'debt' },
  });
  if (props.investing !== null) {
    rows.push({ key: 'investing', title: t('decide.screens.sheetsHome.rule.investing.title'), sub: t('decide.screens.sheetsHome.rule.investing.sub'), value: props.formatMoney(props.investing), on: true, target: { kind: 'investing', amount: props.investing } });
  }
  if (props.saving !== null) {
    rows.push({ key: 'saving', title: t('decide.screens.sheetsHome.rule.saving.title'), sub: t('decide.screens.sheetsHome.rule.saving.sub'), value: props.formatMoney(props.saving), on: true, target: { kind: 'saving', amount: props.saving } });
  }
  for (const rule of props.rules) {
    const category = props.categoryName(rule.categoryId ?? '');
    const [title, sub, value] =
      rule.kind === 'keep'
        ? [t('decide.screens.sheetsHome.addRule.keep'), t('decide.screens.sheetsHome.addRule.keepSub'), props.formatMoney(rule.value)]
        : rule.kind === 'largest'
          ? [t('decide.screens.sheetsHome.rule.largest.title'), t('decide.screens.sheetsHome.rule.largest.sub'), props.formatMoney(rule.value)]
          : rule.kind === 'category_cap'
            ? [t('decide.screens.sheetsHome.rulesCard.categoryTitle', { category }), t('decide.screens.sheetsHome.addRule.categorySub'), props.formatMoney(rule.value)]
            : [t('decide.screens.sheetsHome.rulesCard.categoryTitle', { category }), t('decide.screens.sheetsHome.addRule.categoryShareSub'), pct(rule.value)];
    rows.push({ key: rule.id, title, sub, value, on: rule.on, target: { kind: 'stored', rule } });
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
        <RuleRow key={r.key} row={r} last={false} onPress={() => props.onEdit(r.target)} />
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
