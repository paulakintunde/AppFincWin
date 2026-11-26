// 10.1-27 (SCN-07; D-16, D-20; UI-SPEC 6, owner answer 12): "Where it goes". The category parts built from the items, read only
// (an item's category is changed on the item). "Edit parts" opens the split sheet with these parts; editing them there stops
// the item split, which the note says before and after.
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/ui/Text';
import { Row } from '@/ui/Row';
import { CategoryGlyph } from '@/ui/CategoryGlyph';
import { iconForCategory } from '@/ui/icons/iconFor';
import { LINK_HIT_SLOP } from '@/ui/pressFeedback';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, space, step } from '@/theme/layout';
import { textRole } from '@/theme/typography';
import type { CategoryRow } from '@/db/rows';

export interface WherePart {
  categoryId: string | null;
  /** Positive minor units. */
  amount: number;
  /** The 'Tax and tip' part (D-20), named under its category. */
  taxTip?: boolean;
}

export interface WhereItGoesProps {
  parts: readonly WherePart[];
  categoryOf(id: string | null): CategoryRow | undefined;
  nameOf(id: string | null): string;
  money(minor: number): string;
  /** Without it there is no "Edit parts" (a new line has no parts to edit yet). */
  onEditParts?: () => void;
}

export function WhereItGoes({ parts, categoryOf, nameOf, money, onEditParts }: WhereItGoesProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: colors.fill1 }]} testID="where-it-goes">
      <Text accessibilityRole="header" style={{ ...textRole(pairing, 'sheetTitle'), color: colors.ink, paddingTop: step.row }}>
        {t('scan.byItem.where')}
      </Text>
      {parts.map((p, i) => {
        const row = categoryOf(p.categoryId);
        const name = nameOf(p.categoryId);
        return (
          <View key={`${p.categoryId ?? 'none'}-${i}`} style={i === 0 ? null : [styles.rule, { borderTopColor: colors.line1 }]} testID="where-part">
            <Row
              label={name}
              leading={<CategoryGlyph colorKey={row?.color_key ?? 'slate'} icon={iconForCategory(row)} letter={(name.charAt(0) || '?').toUpperCase()} />}
              amount={money(p.amount)}
              sublabel={p.taxTip ? t('scan.byItem.taxTipPart') : undefined}
            />
          </View>
        );
      })}
      {onEditParts ? (
        <View style={styles.edit}>
          <Pressable accessibilityRole="button" hitSlop={LINK_HIT_SLOP} onPress={onEditParts} style={styles.link} testID="where-edit-parts">
            <Text style={{ ...textRole(pairing, 'label'), color: colors.accent }}>{t('scan.byItem.editParts')}</Text>
          </Pressable>
          <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>{t('scan.byItem.editPartsNote')}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radii.card, paddingHorizontal: step.card, paddingBottom: step.tight },
  rule: { borderTopWidth: 1 },
  edit: { gap: step.hair, paddingBottom: step.tight },
  link: { minHeight: space.touchMin, justifyContent: 'center', alignSelf: 'flex-start' },
});
