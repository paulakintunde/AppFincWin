// Screen 6 (HH-06, D-13, D-34): a default split per category. A default applies once a line is marked shared; a category never
// shares a line by itself. Any member can set one; "Use household default" removes it. Rules are Even, By weight, Mine only
// (the server refuses By amount as a default: exact figures are per line). After a save the apply-to-existing offer follows.
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { Text } from '@/ui/Text';
import { Screen } from '@/ui/Screen';
import { Pill } from '@/ui/Pill';
import { Row } from '@/ui/Row';
import { Sheet, SheetScroll } from '@/ui/Sheet';
import { SheetHeader } from '@/ui/SheetHeader';
import { CategoryGlyph } from '@/ui/CategoryGlyph';
import { iconForCategory } from '@/ui/icons/iconFor';
import { BackButton } from '@/shell/header/BackButton';
import { useBackHistory } from '@/shell/backHistory/BackHistoryProvider';
import { hapticFailed, hapticTap, hapticTick } from '@/ui/haptics';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { space, step } from '@/theme/layout';
import { textRole } from '@/theme/typography';
import { queryKeys } from '@/data/keys';
import { useCategoryLookup } from '@/data/queries/categories';
import { useSplitDefaults } from '@/data/queries/householdBalances';
import type { CategoryRow } from '@/db/rows';
import { setSplitDefault } from '@/db/transactionSplits';
import { categoryName } from '@/features/record/categoryName';
import { supabase } from '@/services/supabase';
import { showToast } from '@/state/undoToast';
import { SplitRuleList, type SplitRuleKey } from '../components/SplitRuleList';
import { useFeature } from '../useFeature';
import { useHouseholdScope } from '../useHouseholdScope';
import { ApplyToExistingSheet } from './ApplyToExistingSheet';

type StoredRule = 'even' | 'weight' | 'mine';
const RULES: readonly SplitRuleKey[] = ['even', 'weight', 'mine'];

/** The key a category default is stored under (08-10): 'builtin:<builtin_key>' or 'custom:<category id>'. */
export function categoryRefOf(c: Pick<CategoryRow, 'id' | 'builtin_key'>): string {
  return c.builtin_key !== null ? `builtin:${c.builtin_key}` : `custom:${c.id}`;
}

export function CategoryDefaultsScreen() {
  const t = useT();
  const { colors, pairing } = useTheme();
  const { goBack } = useBackHistory();
  const enabled = useFeature('hh.categoryDefaults');
  const { householdId, userId } = useHouseholdScope();
  const lookup = useCategoryLookup(userId ?? undefined);
  const { data: defaults } = useSplitDefaults(householdId);
  const [open, setOpen] = useState<CategoryRow | null>(null);
  const [offer, setOffer] = useState<string | null>(null);

  const ruleFor = (c: CategoryRow): StoredRule | null => {
    const ref = categoryRefOf(c);
    return defaults?.find((d) => d.category_ref === ref)?.rule ?? null;
  };
  const anySet = lookup.active.some((c) => ruleFor(c) !== null);

  return (
    <Screen scroll>
      <View style={styles.back}>
        <BackButton variant="compact" onPress={goBack} />
      </View>
      <Text accessibilityRole="header" style={{ ...textRole(pairing, 'heading'), color: colors.ink }}>
        {t('household.rules.categories.title')}
      </Text>
      {enabled ? (
        <View style={styles.column}>
          <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>{t('household.rules.categories.helper')}</Text>
          {anySet ? null : (
            <View testID="category-defaults-empty" accessible>
              <Text style={{ ...textRole(pairing, 'body'), color: colors.ink }}>{t('household.rules.categories.emptyTitle')}</Text>
              <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>{t('household.rules.categories.emptyBody')}</Text>
            </View>
          )}
          {lookup.active.map((c) => {
            const rule = ruleFor(c);
            const name = categoryName(c, t);
            return (
              <Row
                key={c.id}
                label={name}
                sublabel={rule ? t(`household.rules.names.${rule}`) : t('household.rules.categories.householdDefault')}
                leading={<CategoryGlyph colorKey={c.color_key} icon={iconForCategory(c)} letter={name.charAt(0).toUpperCase()} />}
                chevron
                onPress={() => setOpen(c)}
              />
            );
          })}
        </View>
      ) : null}
      {open && householdId ? (
        <CategoryRuleSheet
          householdId={householdId}
          category={open}
          current={ruleFor(open)}
          version={defaults?.find((d) => d.category_ref === categoryRefOf(open))?.version}
          onClose={() => setOpen(null)}
          onSaved={() => {
            setOffer(categoryRefOf(open));
            setOpen(null);
          }}
        />
      ) : null}
      {offer ? (
        <ApplyToExistingSheet householdId={householdId} categoryRef={offer} primaryLabelKey="household.rules.saveSplit" onDone={() => setOffer(null)} />
      ) : null}
    </Screen>
  );
}

interface CategoryRuleSheetProps {
  householdId: string;
  category: CategoryRow;
  current: StoredRule | null;
  version: number | undefined;
  onClose: () => void;
  onSaved: () => void;
}

function CategoryRuleSheet({ householdId, category, current, version, onClose, onSaved }: CategoryRuleSheetProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const qc = useQueryClient();
  const name = categoryName(category, t);
  // null is "Use household default".
  const [picked, setPicked] = useState<StoredRule | null>(current);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const ref = categoryRefOf(category);
  const refresh = () => qc.invalidateQueries({ queryKey: queryKeys.splitDefaults(householdId) });

  const save = async () => {
    if (saving || picked === current) return;
    setSaving(true);
    setFailure(null);
    try {
      const res = await setSplitDefault(supabase, ref, picked, version);
      if (!res.ok) {
        hapticFailed();
        setFailure(res.reason === 'version_conflict' ? t('household.members.reasons.version_conflict') : t('household.rules.failed'));
        if (res.reason === 'version_conflict') await refresh();
        return;
      }
      await refresh();
      hapticTap();
      const before = res.before?.rule ?? null;
      showToast({
        kind: 'ordinary',
        text: { key: 'household.rules.categories.saved' },
        onUndo: () => {
          const back = before === 'even' || before === 'weight' || before === 'mine' ? before : null;
          void setSplitDefault(supabase, ref, back).then(refresh);
        },
      });
      onSaved();
    } catch {
      hapticFailed();
      setFailure(t('household.rules.failed'));
    } finally {
      setSaving(false);
    }
  };

  const title = t('household.rules.categories.sheetTitle', { category: name });
  return (
    <Sheet visible onDismiss={onClose} accessibilityLabel={title} dirty={picked !== current}>
      <SheetHeader title={title} cancelLabel={t('record.sheet.cancel')} onCancel={onClose} />
      <SheetScroll contentContainerStyle={styles.sheet}>
        <Row
          label={t('household.rules.categories.useDefault')}
          selected={picked === null}
          value={picked === null ? '✓' : undefined}
          dense
          onPress={() => {
            if (picked === null) return;
            hapticTick();
            setPicked(null);
          }}
        />
        {/* With "Use household default" picked no rule below is selected (the empty value matches none). */}
        <SplitRuleList value={(picked ?? '') as SplitRuleKey} rules={RULES} onChange={(r) => setPicked(r === 'weight' ? 'weight' : r === 'mine' ? 'mine' : 'even')} />
        {failure ? (
          <Text accessibilityRole="alert" testID="category-default-failure" style={{ ...textRole(pairing, 'label'), color: colors.danger }}>
            {failure}
          </Text>
        ) : null}
        <Pill label={t('household.rules.saveSplit')} variant="primary" onPress={() => void save()} disabled={picked === current} pending={saving} />
      </SheetScroll>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  back: { marginBottom: space.gapMd },
  column: { marginTop: step.section, gap: step.tight },
  sheet: { gap: step.tight },
});
