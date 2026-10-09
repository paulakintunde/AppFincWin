// REC-07, D-34, D-36: category management. Active categories (glyph + name as the anchor)
// open the edit sheet; Transfer and Settlement are listed as system categories with no edit
// action; archived categories can be restored (a single undoable step).
import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { CategoryRow } from '@/db/rows';
import { useArchiveCategory } from '@/data/mutations/categories';
import { useCategoryLookup } from '@/data/queries/categories';
import { useRecordContext } from '@/features/record/useRecordContext';
import { useCategoryMonthUsage, usageSubLabel } from './useCategoryMonthUsage';
import { useMoneyFormatter } from '@/ui/money/useMoneyFormatter';
import { money } from '@/engine/money';
import { categoryName } from '@/features/record/categoryName';
import { useT } from '@/i18n';
import { undoLabelText } from '@/i18n/undoLabel';
import { showToast } from '@/state/undoToast';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/layout';
import { textRole } from '@/theme/typography';
import { CategoryGlyph } from '@/ui/CategoryGlyph';
import { Pill } from '@/ui/Pill';
import { Row } from '@/ui/Row';
import { Screen } from '@/ui/Screen';
import { CategorySheet, type CategorySheetMode } from './CategorySheet';

export function CategoriesScreen() {
  const t = useT();
  const { colors, pairing } = useTheme();
  const rc = useRecordContext();
  const lookup = useCategoryLookup(rc.userId ?? undefined);
  const { usage } = useCategoryMonthUsage();
  const formatter = useMoneyFormatter(rc.showCents);
  const fmt = (minor: number) => formatter.formatMoney(money(minor, rc.homeCurrency));
  const { restore } = useArchiveCategory();
  const [sheet, setSheet] = useState<CategorySheetMode | null>(null);

  const system = lookup.all.filter((c) => c.is_system);
  const archived = lookup.all.filter((c) => c.archived_at !== null && !c.is_system);

  const glyph = (c: CategoryRow) => (
    <CategoryGlyph colorKey={c.color_key} letter={categoryName(c, t).charAt(0).toUpperCase()} />
  );

  const doRestore = (c: CategoryRow) => {
    const name = categoryName(c, t);
    const stepId = restore(c);
    showToast({ kind: 'ordinary', text: undoLabelText('categoryEdited', { name }), stepId });
  };

  const titleStyle = { ...textRole(pairing, 'sheetTitle'), color: colors.ink };
  const sectionStyle = { ...textRole(pairing, 'label'), color: colors.inkMuted };

  return (
    <Screen scroll>
      <View style={styles.column}>
        <Text accessibilityRole="header" style={titleStyle}>
          {t('categories.title')}
        </Text>
        {lookup.active.map((c) => {
          const u = usage.get(c.id);
          const sub = u ? usageSubLabel(u, fmt, t) : null;
          return (
            <Row
              key={c.id}
              label={categoryName(c, t)}
              sublabel={sub?.text}
              sublabelTone={sub?.tone}
              leading={glyph(c)}
              chevron
              onPress={() => setSheet({ kind: 'edit', category: c })}
            />
          );
        })}
        <Pill label={t('categories.add')} variant="primary" onPress={() => setSheet({ kind: 'new' })} />

        {system.length > 0 ? (
          <View style={styles.section}>
            {system.map((c) => (
              <Row key={c.id} label={categoryName(c, t)} leading={glyph(c)} />
            ))}
            <Text style={sectionStyle}>{t('categories.systemNote')}</Text>
          </View>
        ) : null}

        {archived.length > 0 ? (
          <View style={styles.section}>
            <Text accessibilityRole="header" style={sectionStyle}>
              {t('categories.archivedSection')}
            </Text>
            {archived.map((c) => (
              <View key={c.id} style={styles.archivedRow}>
                <View style={styles.flex}>
                  <Row label={categoryName(c, t)} leading={glyph(c)} />
                </View>
                <Pill label={t('categories.restore')} variant="secondary" onPress={() => doRestore(c)} />
              </View>
            ))}
          </View>
        ) : null}
      </View>
      {sheet ? <CategorySheet visible mode={sheet} onClose={() => setSheet(null)} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  column: {
    gap: space.gapSm,
  },
  section: {
    gap: space.gapSm,
    marginTop: space.groupGap,
  },
  archivedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.gapMd,
  },
  flex: {
    flex: 1,
  },
});
