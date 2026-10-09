// Active categories with glyph tiles, plus an 'Uncategorised' choice (null).
import React from 'react';
import { Sheet, SheetScroll } from '@/ui/Sheet';
import { SheetHeader } from '@/ui/SheetHeader';
import { Row } from '@/ui/Row';
import { CategoryGlyph } from '@/ui/CategoryGlyph';
import { useT } from '@/i18n';
import type { CategoryRow } from '@/db/rows';
import type { CategoryUsageResult } from '@/engine/categorize';
import { usageSubLabel } from '../../categories/usageSubLabel';
import { categoryName } from '../../categoryName';

export interface CategoryPickerProps {
  visible: boolean;
  categories: readonly CategoryRow[];
  selectedId: string | null;
  onSelect: (categoryId: string | null) => void;
  onClose: () => void;
  /** REC-22: this month's usage per category; sorts by use and shows the sub-labels. */
  usage?: ReadonlyMap<string, CategoryUsageResult>;
  /** Formats home-currency minor units for the sub-labels (the caller owns locale and currency). */
  formatMinor?: (minor: number) => string;
  /** Opens category management; the 'Manage categories…' row shows when given. */
  onManage?: () => void;
}

export function CategoryPicker({ visible, categories, selectedId, onSelect, onClose, usage, formatMinor, onManage }: CategoryPickerProps) {
  const t = useT();
  const fmt = formatMinor ?? String;
  const ordered = usage
    ? [...categories].sort(
        (a, b) =>
          (usage.get(b.id)?.count ?? 0) - (usage.get(a.id)?.count ?? 0) ||
          categoryName(a, t).localeCompare(categoryName(b, t))
      )
    : categories;
  const subFor = (category: CategoryRow): { text: string; tone: 'inkMuted' | 'warn1' } | null => {
    const u = usage?.get(category.id);
    if (!u) return null;
    if (u.state === 'capped' && u.count === 0 && u.cap !== null) {
      return { text: t('categories.usage.capPerMonth', { amount: fmt(u.cap) }), tone: 'inkMuted' };
    }
    return usageSubLabel(u, fmt, t);
  };
  const title = t('record.sheet.field.category');
  return (
    <Sheet visible={visible} onDismiss={onClose} accessibilityLabel={title}>
      <SheetHeader title={title} cancelLabel={t('record.sheet.cancel')} onCancel={onClose} />
      <SheetScroll>
        <Row
          label={t('record.sheet.uncategorised')}
          dense
          value={selectedId === null ? '✓' : undefined}
          selected={selectedId === null}
          onPress={() => onSelect(null)}
        />
        {ordered.map((category) => {
          const name = categoryName(category, t);
          const sub = subFor(category);
          return (
            <Row
              key={category.id}
              label={name}
              dense
              sublabel={sub?.text}
              sublabelTone={sub?.tone}
              leading={<CategoryGlyph colorKey={category.color_key} letter={name.charAt(0).toUpperCase()} />}
              value={category.id === selectedId ? '✓' : undefined}
              selected={category.id === selectedId}
              accessibilityLabel={name}
              onPress={() => onSelect(category.id)}
            />
          );
        })}
        {onManage ? (
          <Row
            label={t('categories.usage.manage')}
            sublabel={t('categories.usage.manageSub')}
            dense
            chevron
            onPress={onManage}
          />
        ) : null}
      </SheetScroll>
    </Sheet>
  );
}
