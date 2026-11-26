// 10.1-20 (D-03, D-05; UI-SPEC section 2): the expanded Categories row of a split line. One row per part with the category's tile,
// name and amount; an unplaced gap reads as "Uncategorised"; under the list a Total line with "Adds up" or the gap badge;
// then "Edit split". The rows always add up to the line's total (expandParts puts any gap in its own row).
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/ui/Text';
import type { CategoryLookup } from '@/data/queries/categories';
import { expandParts, type Part } from '@/engine/parts';
import { money } from '@/engine/money';
import { categoryName } from '@/features/record/categoryName';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/layout';
import { textRole } from '@/theme/typography';
import type { CategorySwatchKey } from '@/theme/tokens';
import { CategoryGlyph } from '@/ui/CategoryGlyph';
import { iconForCategory } from '@/ui/icons/iconFor';
import { LINK_HIT_SLOP } from '@/ui/pressFeedback';
import { Row } from '@/ui/Row';
import { StateBadge } from '@/ui/StateBadge';
import type { MoneyFormatter } from '@/ui/money/useMoneyFormatter';

export interface PartsViewProps {
  line: { id: string; original_amount: number; original_currency: string; category_id: string | null };
  parts: readonly Part[];
  categories: CategoryLookup;
  formatter: MoneyFormatter;
  /** Opens the split sheet prefilled. Omitted for a read-only view. */
  onEdit?: () => void;
}

export function PartsView({ line, parts, categories, formatter, onEdit }: PartsViewProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const rows = expandParts({ id: line.id, amount: line.original_amount, categoryId: line.category_id, parts });
  const gap = rows.find((r) => r.isGap) ?? null;
  // Magnitudes: the part rows share the line's sign, and the sheet header already shows it.
  const fmt = (minor: number) => formatter.formatMoney(money(Math.abs(minor), line.original_currency));
  const totalText = fmt(line.original_amount);
  return (
    <View testID="parts-view" style={styles.wrap}>
      {rows.map((r, i) => {
        const category = r.categoryId !== null ? categories.byId.get(r.categoryId) : undefined;
        const label = category ? categoryName(category, t) : t('split.uncategorised');
        const swatchKey: CategorySwatchKey = (category?.color_key as CategorySwatchKey | undefined) ?? 'slate';
        return (
          <Row
            key={`${i}-${r.categoryId ?? 'gap'}`}
            label={label}
            emphasis
            amount={fmt(r.amount)}
            leading={<CategoryGlyph colorKey={swatchKey} icon={iconForCategory(category)} letter={(label.charAt(0) || '?').toUpperCase()} />}
          />
        );
      })}
      <View style={styles.total} accessible accessibilityLabel={`${t('split.detail.total', { amount: totalText })}, ${gap ? t('split.gap.badge') : t('split.balance.addsUp')}`}>
        <Text style={{ ...textRole(pairing, 'bodyStrong'), color: colors.ink, flexShrink: 1 }}>{t('split.detail.total', { amount: totalText })}</Text>
        {gap ? (
          <StateBadge tone="tight" shape="sHalf" label={t('split.gap.badge')} testID="parts-view-gap-badge" />
        ) : (
          <StateBadge tone="fits" shape="sCheck" label={t('split.balance.addsUp')} testID="parts-view-adds-up" />
        )}
      </View>
      {onEdit ? (
        <Pressable accessibilityRole="button" accessibilityLabel={t('split.detail.edit')} hitSlop={LINK_HIT_SLOP} onPress={onEdit} style={styles.edit}>
          <Text style={{ ...textRole(pairing, 'bodyStrong'), color: colors.accent }}>{t('split.detail.edit')}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingBottom: space.gapMd },
  total: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.gapMd, paddingVertical: space.gapMd },
  edit: { minHeight: space.touchMin, justifyContent: 'center', alignSelf: 'flex-start' },
});
