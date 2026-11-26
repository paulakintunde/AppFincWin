// 10.1-18 (SPL-01, D-04): one part of a split. Category glyph + name (wraps, never truncated) + chevron opens the category list;
// a compact amount field; a remove button (hidden at 2 parts). Above 1.3x font scale the amount drops under the name.
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/ui/Text';
import { MoneyInput } from '@/ui/MoneyInput';
import { Glyph } from '@/ui/icons/Glyph';
import { FadeIn } from '@/ui/motion/FadeIn';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { useFontScale } from '@/theme/FontScaleProvider';
import { rowHeight, space, step } from '@/theme/layout';
import { textRole } from '@/theme/typography';

export interface SplitPartRowProps {
  n: number;
  categoryName: string;
  /** The category tile (CategoryGlyph). */
  glyph: React.ReactNode;
  /** 'Counts as saving' / 'Counts as a move between your accounts', or null. */
  note: string | null;
  amount: number | null;
  currency: string;
  /** The spoken amount for the row label. */
  spokenAmount: string;
  canRemove: boolean;
  /** Show 'Every part needs an amount.' under the row. */
  needsAmount: boolean;
  /** True for a row added after the sheet opened, so it fades in. */
  fresh: boolean;
  onPickCategory: () => void;
  onAmount: (minor: number | null) => void;
  onRemove: () => void;
}

const STACK_AT = 1.3;

export function SplitPartRow(p: SplitPartRowProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const fontScale = useFontScale();
  const stacked = fontScale > STACK_AT;

  const category = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('split.a11y.partRow', { n: p.n, category: p.categoryName, amount: p.spokenAmount })}
      onPress={p.onPickCategory}
      style={styles.category}
      testID={`split-part-${p.n}-category`}
    >
      {p.glyph}
      <View style={styles.name}>
        <Text style={{ ...textRole(pairing, 'bodyStrong'), color: colors.ink }}>{p.categoryName}</Text>
        {p.note ? <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>{p.note}</Text> : null}
      </View>
      <Glyph name="arrowRight" size={16} color={colors.inkFaint} />
    </Pressable>
  );

  const amount = (
    <View style={stacked ? styles.amountStacked : styles.amount}>
      <MoneyInput
        value={p.amount}
        currency={p.currency}
        label={t('split.part.amountFor', { n: p.n })}
        accessibilityLabel={t('split.part.amountFor', { n: p.n })}
        onChange={p.onAmount}
        compact
      />
    </View>
  );

  const remove = p.canRemove ? <RemoveButton n={p.n} onPress={p.onRemove} /> : null;
  const body = (
    <View style={[styles.row, { minHeight: rowHeight.two }]}>
      <View style={styles.line}>
        <View style={styles.categoryWrap}>{category}</View>
        {stacked ? null : amount}
        {remove}
      </View>
      {stacked ? amount : null}
      {p.needsAmount ? (
        <View style={styles.needs} accessibilityRole="alert">
          <Glyph name="stateShort" size={16} color={colors.danger} />
          <Text style={{ ...textRole(pairing, 'label'), color: colors.danger, flexShrink: 1 }}>{t('split.part.needsAmount')}</Text>
        </View>
      ) : null}
    </View>
  );
  return p.fresh ? <FadeIn>{body}</FadeIn> : body;
}

function RemoveButton({ n, onPress }: { n: number; onPress: () => void }) {
  const t = useT();
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('split.part.remove', { n })}
      onPress={onPress}
      style={styles.remove}
      testID={`split-part-${n}-remove`}
    >
      <Glyph name="close" size={20} color={colors.inkMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { paddingVertical: step.tight, justifyContent: 'center' },
  line: { flexDirection: 'row', alignItems: 'center', gap: step.tight },
  categoryWrap: { flex: 1 },
  category: { flexDirection: 'row', alignItems: 'center', gap: step.row, minHeight: space.touchMin },
  name: { flex: 1 },
  amount: { flexShrink: 0 },
  amountStacked: { alignSelf: 'stretch' },
  remove: { width: space.touchMin, height: space.touchMin, alignItems: 'center', justifyContent: 'center' },
  needs: { flexDirection: 'row', alignItems: 'center', gap: step.hair },
});
