// 10.1-24 (SCN-02, SCN-05; UI-SPEC 5d): one item on the scan review. Name (bodyStrong, up to 3 lines) and price, the category
// chip under the name, "Check this" with a crop of the receipt beside an unsure item, and a remove button. Tapping the name or
// price opens the inline fields; "Done" closes them. Colour is never the only signal: "Check this" carries the caution glyph
// and the words.
import React, { useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/ui/Text';
import { TextInput } from '@/ui/TextInput';
import { MoneyInput } from '@/ui/MoneyInput';
import { Glyph } from '@/ui/icons/Glyph';
import type { IconName } from '@/ui/icons/iconData';
import { LINK_HIT_SLOP } from '@/ui/pressFeedback';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, space, step } from '@/theme/layout';
import { stateColors } from '@/theme/tokens';
import { textRole } from '@/theme/typography';
import type { ReceiptFrame } from '@/engine/receipt';
import type { ReviewItem } from './scanModel';

export const CROP_SIZE = 96; // UI-SPEC media geometry: the reference photo beside a "Check this" item

export interface CropSource {
  uri: string;
  width: number;
  height: number;
}

/** Where the page image sits inside the 96 x 96 window so the item's line is centred (integer pixels, no image library). */
export function cropLayout(frame: ReceiptFrame, img: { width: number; height: number }): { width: number; height: number; left: number; top: number } {
  const side = Math.max(1, Math.min(Math.max(img.width, img.height), Math.max(frame.width, frame.height * 3) * 1.1));
  const scale = CROP_SIZE / side;
  const cx = frame.left + frame.width / 2;
  const cy = frame.top + frame.height / 2;
  return {
    width: Math.round(img.width * scale),
    height: Math.round(img.height * scale),
    left: Math.round(CROP_SIZE / 2 - cx * scale),
    top: Math.round(CROP_SIZE / 2 - cy * scale),
  };
}

export function ReceiptCrop({ source, frame, label }: { source: CropSource; frame: ReceiptFrame; label: string }) {
  const { colors } = useTheme();
  const box = cropLayout(frame, source);
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={label}
      style={[styles.crop, { backgroundColor: colors.fill1, borderColor: colors.line1 }]}
      testID="scan-item-crop"
    >
      <Image source={{ uri: source.uri }} style={{ position: 'absolute', ...box }} resizeMode="stretch" />
    </View>
  );
}

export interface ItemRowProps {
  item: ReviewItem;
  currency: string;
  /** The price as shown and as spoken ("$4.50", "4 dollars 50"). */
  priceText: string;
  spokenPrice: string;
  categoryName: string | null;
  categoryIcon: IconName | null;
  crop: CropSource | null;
  startEditing?: boolean;
  onName(name: string): void;
  onPrice(minor: number | null): void;
  onPickCategory(): void;
  onRemove(): void;
}

export function ItemRow({ item, currency, priceText, spokenPrice, categoryName, categoryIcon, crop, startEditing = false, onName, onPrice, onPickCategory, onRemove }: ItemRowProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const [editing, setEditing] = useState(startEditing);
  const name = item.name.trim() === '' ? t('scan.item.unnamed') : item.name;
  const check = t('scan.review.checkThis');
  const spoken =
    t('scan.item.a11y', { name, amount: spokenPrice, category: categoryName ?? t('scan.item.chooseCategory') }) +
    (item.unsure ? `, ${check}` : '');
  const tight = stateColors.tight;

  return (
    <View style={styles.row} testID={`scan-item-${item.key}`}>
      <View style={styles.main}>
        {editing ? (
          <View style={styles.fields}>
            <TextInput
              value={item.name}
              onChangeText={onName}
              accessibilityLabel={t('scan.item.name')}
              autoFocus={startEditing}
              multiline
              style={[styles.nameInput, { ...textRole(pairing, 'bodyStrong'), color: colors.ink, backgroundColor: colors.fill1 }]}
              testID="scan-item-name"
            />
            <MoneyInput
              value={item.price}
              currency={currency}
              onChange={onPrice}
              label={t('scan.item.price', { name })}
              accessibilityLabel={t('scan.item.price', { name })}
              amountField={{}}
            />
            <Pressable accessibilityRole="button" hitSlop={LINK_HIT_SLOP} onPress={() => setEditing(false)} style={styles.link} testID="scan-item-done">
              <Text style={{ ...textRole(pairing, 'label'), color: colors.accent }}>{t('scan.item.done')}</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={spoken}
            onPress={() => setEditing(true)}
            style={styles.summary}
            testID="scan-item-summary"
          >
            <Text numberOfLines={3} style={{ ...textRole(pairing, 'bodyStrong'), color: colors.ink, flexShrink: 1, flexGrow: 1 }}>
              {name}
            </Text>
            <Text scale="capped" style={{ ...textRole(pairing, 'bodyStrong'), color: item.price === null ? colors.inkMuted : colors.ink, fontVariant: ['tabular-nums'] }}>
              {priceText}
            </Text>
          </Pressable>
        )}

        <View style={styles.chips}>
          {categoryName !== null ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={categoryName}
              hitSlop={LINK_HIT_SLOP}
              onPress={onPickCategory}
              style={[styles.chip, { backgroundColor: colors.fill1 }]}
              testID="scan-item-category"
            >
              {categoryIcon ? <Glyph name={categoryIcon} size={16} color={colors.ink} /> : null}
              <Text style={{ ...textRole(pairing, 'label'), color: colors.ink, flexShrink: 1 }}>{categoryName}</Text>
            </Pressable>
          ) : (
            <Pressable accessibilityRole="button" hitSlop={LINK_HIT_SLOP} onPress={onPickCategory} style={styles.link} testID="scan-item-category">
              <Text style={{ ...textRole(pairing, 'label'), color: colors.accent }}>{t('scan.item.chooseCategory')}</Text>
            </Pressable>
          )}
          {item.unsure ? (
            <View
              accessible
              accessibilityLabel={t('scan.checkThis.a11y')}
              style={[styles.chip, { backgroundColor: tight.tint }]}
              testID="scan-item-check"
            >
              <Glyph name="caution" size={16} color={tight.color} />
              <Text style={{ ...textRole(pairing, 'label'), color: tight.color }}>{check}</Text>
            </View>
          ) : null}
        </View>
      </View>

      {item.unsure && crop && item.frame ? <ReceiptCrop source={crop} frame={item.frame} label={t('scan.checkThis.a11y')} /> : null}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('scan.item.remove', { name })}
        onPress={onRemove}
        style={styles.remove}
        testID="scan-item-remove"
      >
        <Glyph name="delete" size={20} color={colors.inkMuted} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: step.row, paddingVertical: step.row, minHeight: 64 },
  main: { flex: 1, gap: step.tight },
  summary: { flexDirection: 'row', alignItems: 'flex-start', gap: step.row, minHeight: space.touchMin },
  fields: { gap: step.tight },
  nameInput: { borderRadius: radii.card, paddingHorizontal: step.row, paddingVertical: step.tight, minHeight: space.touchMin },
  chips: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: step.tight },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: step.hair,
    paddingHorizontal: step.row,
    paddingVertical: step.hair,
    borderRadius: radii.pill,
    minHeight: 28,
  },
  link: { minHeight: space.touchMin, justifyContent: 'center', alignSelf: 'flex-start' },
  crop: { width: CROP_SIZE, height: CROP_SIZE, overflow: 'hidden', borderRadius: radii.card, borderWidth: 1 },
  remove: { width: space.touchMin, height: space.touchMin, alignItems: 'center', justifyContent: 'center' },
});
