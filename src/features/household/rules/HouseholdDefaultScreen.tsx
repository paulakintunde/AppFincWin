// Screen 6 (HH-05, D-34): the household default split. Any member can change it; the server names the change in Notices and
// the toast offers Undo. Mine only is not a household rule, so it is not offered here. After a save, the apply-to-existing
// offer states how many unsettled lines the new default could also apply to (D-35).
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { Text } from '@/ui/Text';
import { Screen } from '@/ui/Screen';
import { Pill } from '@/ui/Pill';
import { BackButton } from '@/shell/header/BackButton';
import { useBackHistory } from '@/shell/backHistory/BackHistoryProvider';
import { hapticFailed, hapticTap } from '@/ui/haptics';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { space, step } from '@/theme/layout';
import { textRole } from '@/theme/typography';
import { queryKeys } from '@/data/keys';
import { useSplitDefaults } from '@/data/queries/householdBalances';
import { setSplitDefault } from '@/db/transactionSplits';
import { supabase } from '@/services/supabase';
import { showToast } from '@/state/undoToast';
import { SplitRuleList, type SplitRuleKey } from '../components/SplitRuleList';
import { useHouseholdScope } from '../useHouseholdScope';
import { ApplyToExistingSheet } from './ApplyToExistingSheet';

type DefaultRule = 'even' | 'weight';
const RULES: readonly SplitRuleKey[] = ['even', 'weight'];

export function HouseholdDefaultScreen() {
  const t = useT();
  const { colors, pairing } = useTheme();
  const qc = useQueryClient();
  const { goBack } = useBackHistory();
  const { householdId, online } = useHouseholdScope();
  const { data: defaults } = useSplitDefaults(householdId);
  const current = defaults?.find((d) => d.category_ref === null) ?? null;
  const stored: DefaultRule = current?.rule === 'weight' ? 'weight' : 'even';
  const [picked, setPicked] = useState<DefaultRule | null>(null);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [offer, setOffer] = useState(false);
  const value = picked ?? stored;

  const save = async () => {
    if (saving || householdId == null || value === stored) return;
    if (!online) {
      setFailure(t('household.rules.needsConnection'));
      return;
    }
    setSaving(true);
    setFailure(null);
    try {
      const res = await setSplitDefault(supabase, null, value, current?.version);
      if (!res.ok) {
        hapticFailed();
        setFailure(res.reason === 'version_conflict' ? t('household.members.reasons.version_conflict') : t('household.rules.failed'));
        if (res.reason === 'version_conflict') await qc.invalidateQueries({ queryKey: queryKeys.splitDefaults(householdId) });
        return;
      }
      await qc.invalidateQueries({ queryKey: queryKeys.splitDefaults(householdId) });
      hapticTap();
      const before = res.before?.rule;
      showToast({
        kind: 'ordinary',
        text: { key: 'household.rules.defaultSheet.saved' },
        onUndo:
          before === 'even' || before === 'weight' || before === 'mine'
            ? () => {
                void setSplitDefault(supabase, null, before).then(() => qc.invalidateQueries({ queryKey: queryKeys.splitDefaults(householdId) }));
              }
            : null,
      });
      setPicked(null);
      setOffer(true);
    } catch {
      hapticFailed();
      setFailure(t('household.rules.failed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen scroll>
      <View style={styles.back}>
        <BackButton variant="compact" onPress={goBack} />
      </View>
      <Text accessibilityRole="header" style={{ ...textRole(pairing, 'heading'), color: colors.ink }}>
        {t('household.rules.defaultSheet.title')}
      </Text>
      <View style={styles.column}>
        <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>{t('household.rules.defaultSheet.helper')}</Text>
        <SplitRuleList value={value} rules={RULES} onChange={(r) => setPicked(r === 'weight' ? 'weight' : 'even')} />
        {failure ? (
          <Text accessibilityRole="alert" testID="default-failure" style={{ ...textRole(pairing, 'label'), color: colors.danger }}>
            {failure}
          </Text>
        ) : null}
        <Pill label={t('household.rules.saveDefault')} variant="primary" onPress={() => void save()} disabled={value === stored} pending={saving} />
      </View>
      {offer ? (
        <ApplyToExistingSheet householdId={householdId} categoryRef={null} primaryLabelKey="household.rules.saveDefault" onDone={() => setOffer(false)} />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  back: { marginBottom: space.gapMd },
  column: { marginTop: step.section, gap: step.row },
});
