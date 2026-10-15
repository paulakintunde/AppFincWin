// REC-27, D-08, D-26: the Rules list at You -> Categories -> Rules. 'Just me' rules first, then
// 'Shared with household', each A-Z by keyword. A shared rule that does not resolve for this
// member is shown as 'not in your categories' and is skipped for their guesses. Rule text
// from other members renders as plain Text only (T-02.3-14-01).
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '@/ui/Text';
import type { CategoryRuleRow } from '@/db/categoryRules';
import { useCategoryRules } from '@/data/queries/categoryRules';
import { useCategoryLookup } from '@/data/queries/categories';
import { useRecordContext } from '@/features/record/useRecordContext';
import { useGuessContext } from '@/features/record/useGuessContext';
import { categoryName } from '@/features/record/categoryName';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/layout';
import { textRole } from '@/theme/typography';
import { CategoryGlyph } from '@/ui/CategoryGlyph';
import { EmptyState } from '@/ui/EmptyState';
import { Pill } from '@/ui/Pill';
import { Row } from '@/ui/Row';
import { SyncProblemLine } from '@/shell/header/SyncProblemLine';
import { Screen } from '@/ui/Screen';
import { RuleSheet, type RuleSheetMode } from './RuleSheet';

const byKeyword = (a: CategoryRuleRow, b: CategoryRuleRow) => a.keyword_norm.localeCompare(b.keyword_norm);

export function RulesScreen() {
  const t = useT();
  const { colors, pairing } = useTheme();
  const rc = useRecordContext();
  const lookup = useCategoryLookup(rc.userId ?? undefined);
  const query = useCategoryRules(rc.userId ?? undefined, rc.householdId ?? undefined);
  const { rules, resolved } = useGuessContext();
  const [sheet, setSheet] = useState<RuleSheetMode | null>(null);

  const personal = rules.filter((r) => r.scope === 'personal').sort(byKeyword);
  const shared = rules.filter((r) => r.scope === 'shared').sort(byKeyword);
  const hasCache = query.data !== undefined;

  const titleStyle = { ...textRole(pairing, 'sheetTitle'), color: colors.ink };
  const mutedStyle = { ...textRole(pairing, 'label'), color: colors.inkMuted };

  const renderRow = (rule: CategoryRuleRow) => {
    const categoryId = resolved.byRuleId.get(rule.id) ?? null;
    const cat = categoryId ? (lookup.byId.get(categoryId) ?? null) : null;
    const scopeName = rule.scope === 'shared' ? t('categories.rules.sectionShared') : t('categories.rules.sectionMine');
    let storedName = '';
    if (cat) storedName = categoryName(cat, t);
    else if (rule.target_name) storedName = rule.target_name;
    else if (rule.target_builtin_key) storedName = t(`categories.builtin.${rule.target_builtin_key}`);
    const unresolved = cat === null;
    return (
      <Row
        key={rule.id}
        label={rule.keyword}
        sublabel={unresolved ? t('categories.rules.notInYours', { name: storedName }) : storedName}
        leading={
          <CategoryGlyph
            colorKey={cat ? cat.color_key : 'slate'}
            letter={(storedName.charAt(0) || '?').toUpperCase()}
          />
        }
        accessibilityLabel={t(unresolved ? 'categories.rules.rowA11yUnresolved' : 'categories.rules.rowA11y', {
          keyword: rule.keyword,
          category: storedName,
          scope: scopeName,
        })}
        chevron
        onPress={() => setSheet({ kind: 'edit', rule, categoryId })}
      />
    );
  };

  const section = (title: string, list: CategoryRuleRow[]) =>
    list.length === 0 ? null : (
      <View style={styles.section}>
        <Text accessibilityRole="header" style={mutedStyle}>
          {title}
        </Text>
        {list.map(renderRow)}
      </View>
    );

  const loading = query.isLoading && !hasCache;
  const failed = query.isError && !hasCache;
  const empty = !loading && !failed && personal.length === 0 && shared.length === 0;

  return (
    <Screen scroll>
      <SyncProblemLine inset={false} />
      <View style={styles.column}>
        <Text accessibilityRole="header" style={titleStyle}>
          {t('categories.rules.title')}
        </Text>
        <Text style={mutedStyle}>{t('categories.rules.helper')}</Text>
        <Pill label={t('categories.rules.add')} variant="primary" onPress={() => setSheet({ kind: 'new' })} />
        {loading ? <Text style={mutedStyle}>{t('categories.rules.loading')}</Text> : null}
        {failed ? (
          <View style={styles.section}>
            <Text style={mutedStyle}>{t('categories.rules.loadFailed')}</Text>
            <Pill label={t('categories.rules.retry')} variant="secondary" onPress={() => void query.refetch()} />
          </View>
        ) : null}
        {empty ? (
          <EmptyState heading={t('categories.rules.emptyHeading')} body={t('categories.rules.emptyBody')} />
        ) : null}
        {section(t('categories.rules.sectionMine'), personal)}
        {section(t('categories.rules.sectionShared'), shared)}
      </View>
      {sheet ? <RuleSheet visible mode={sheet} onClose={() => setSheet(null)} /> : null}
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
});
