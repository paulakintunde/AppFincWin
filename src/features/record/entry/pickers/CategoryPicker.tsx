// Active categories with glyph tiles, plus an 'Uncategorised' choice (null).
import React from 'react';
import { Sheet, SheetScroll } from '@/ui/Sheet';
import { SheetHeader } from '@/ui/SheetHeader';
import { Row } from '@/ui/Row';
import { CategoryGlyph } from '@/ui/CategoryGlyph';
import { useT } from '@/i18n';
import type { CategoryRow } from '@/db/rows';
import { categoryName } from '../../categoryName';

export interface CategoryPickerProps {
  visible: boolean;
  categories: readonly CategoryRow[];
  selectedId: string | null;
  onSelect: (categoryId: string | null) => void;
  onClose: () => void;
}

export function CategoryPicker({ visible, categories, selectedId, onSelect, onClose }: CategoryPickerProps) {
  const t = useT();
  const title = t('record.sheet.field.category');
  return (
    <Sheet visible={visible} onDismiss={onClose} accessibilityLabel={title}>
      <SheetHeader title={title} cancelLabel={t('record.sheet.cancel')} onCancel={onClose} />
      <SheetScroll>
        <Row
          label={t('record.sheet.uncategorised')}
          dense
          value={selectedId === null ? '✓' : undefined}
          onPress={() => onSelect(null)}
        />
        {categories.map((category) => {
          const name = categoryName(category, t);
          return (
            <Row
              key={category.id}
              label={name}
              dense
              leading={<CategoryGlyph colorKey={category.color_key} letter={name.charAt(0).toUpperCase()} />}
              value={category.id === selectedId ? '✓' : undefined}
              accessibilityLabel={name}
              onPress={() => onSelect(category.id)}
            />
          );
        })}
      </SheetScroll>
    </Sheet>
  );
}
