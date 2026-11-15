/**
 * 06.2-19 (D-07, D-20): the icon picker for a custom category. A nested sheet on the category sheet's stack (no new
 * navigation): a grid of 36 tiles from our own set only (CUSTOM_CATEGORY_ICONS), drawn in the category's chosen colour,
 * plus a "Letter" tile that clears the icon. Each tile is a radio with a 48 target and a spoken word (D-06); picking one
 * gives a tick and hands the choice back. Never emoji: every tile is an ICONS glyph or the letter.
 */
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { CategoryColorKey } from '@/engine/categorize';
import { useT } from '@/i18n';
import { categories as categoryWords } from '@/i18n/locales/appLife/categories';
import { useTheme } from '@/theme/ThemeProvider';
import { step, tile } from '@/theme/layout';
import { CategoryGlyph } from '@/ui/CategoryGlyph';
import { hapticTick } from '@/ui/haptics';
import { CUSTOM_CATEGORY_ICONS } from '@/ui/icons/iconFor';
import type { IconName } from '@/ui/icons/iconData';
import { Sheet, SheetScroll } from '@/ui/Sheet';
import { SheetHeader } from '@/ui/SheetHeader';

export interface CategoryIconPickerProps {
  visible: boolean;
  colorKey: CategoryColorKey;
  letter: string;
  selected: IconName | null;
  onPick: (icon: IconName | null) => void;
  onClose: () => void;
}

type IconWordKey = keyof typeof categoryWords.iconNames;
const hasWord = (icon: IconName): icon is IconName & IconWordKey =>
  Object.prototype.hasOwnProperty.call(categoryWords.iconNames, icon);

/**
 * The plain word for a pickable icon (appLife.categories.iconNames), or the letter tile's word for null. An icon_key
 * outside the pickable set (saved elsewhere) reads as the row's own word, "Icon", rather than a raw key.
 */
export function useIconWord(): (icon: IconName | null) => string {
  const t = useT();
  return (icon) => {
    if (icon === null) return t('appLife.categories.iconNone');
    return hasWord(icon) ? t(`appLife.categories.iconNames.${icon}`) : t('appLife.categories.iconLabel');
  };
}

export function CategoryIconPicker({ visible, colorKey, letter, selected, onPick, onClose }: CategoryIconPickerProps) {
  const t = useT();
  const word = useIconWord();
  const { colors } = useTheme();
  if (!visible) return null;

  const choose = (icon: IconName | null) => {
    hapticTick();
    onPick(icon);
  };

  const option = (icon: IconName | null) => {
    const isSelected = icon === selected;
    const key = icon ?? 'none';
    return (
      <Pressable
        key={key}
        testID={`category-icon-${key}`}
        accessibilityRole="radio"
        accessibilityState={{ checked: isSelected }}
        accessibilityLabel={t('appLife.categories.iconA11y', { name: word(icon) })}
        onPress={() => choose(icon)}
        style={[styles.target, { borderColor: isSelected ? colors.accent : 'transparent' }]}
      >
        <CategoryGlyph colorKey={colorKey} icon={icon} letter={letter} />
      </Pressable>
    );
  };

  const title = t('appLife.categories.iconPickerTitle');
  return (
    <Sheet visible onDismiss={onClose} accessibilityLabel={title}>
      <SheetHeader title={title} cancelLabel={t('record.sheet.cancel')} onCancel={onClose} />
      <SheetScroll>
        <View accessibilityRole="radiogroup" style={styles.grid}>
          {option(null)}
          {CUSTOM_CATEGORY_ICONS.map((icon) => option(icon))}
        </View>
      </SheetScroll>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: step.tight,
    paddingBottom: step.card,
  },
  target: {
    width: tile.big,
    height: tile.big,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderRadius: tile.big / 4,
  },
});
