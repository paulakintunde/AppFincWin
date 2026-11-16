// Screen 6/7 offer (HH-05, HH-06, D-35): after any rule or weight change, "Change the split?" with the exact number of
// unsettled lines the rule could also apply to. The count comes from the server (count_unsettled_for_rule), which leaves out
// lines nobody split by hand, lines split by exact amounts and lines a settle-up covers. Settled lines never change.
import React, { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { Text } from '@/ui/Text';
import { ConfirmSheet } from '@/ui/ConfirmSheet';
import { ToggleRow } from '@/ui/ToggleRow';
import { hapticFailed, hapticTap } from '@/ui/haptics';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { step } from '@/theme/layout';
import { textRole } from '@/theme/typography';
import { queryKeys } from '@/data/keys';
import { applyRuleToUnsettled, countUnsettledForRule } from '@/db/transactionSplits';
import { supabase } from '@/services/supabase';
import { showToast } from '@/state/undoToast';

export type ApplyPrimaryLabelKey = 'household.rules.saveSplit' | 'household.rules.saveWeights' | 'household.rules.saveDefault';

export interface ApplyToExistingSheetProps {
  householdId: string | null | undefined;
  /** Null is the household default (and weights); otherwise 'builtin:<key>' or 'custom:<category id>'. */
  categoryRef: string | null;
  primaryLabelKey: ApplyPrimaryLabelKey;
  /** The offer is finished, applied or not. */
  onDone: () => void;
}

export function ApplyToExistingSheet({ householdId, categoryRef, primaryLabelKey, onDone }: ApplyToExistingSheetProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const qc = useQueryClient();
  const [count, setCount] = useState<number | null>(null);
  const [on, setOn] = useState(true);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    countUnsettledForRule(supabase, categoryRef)
      .then((res) => {
        if (live) setCount(res.ok ? (res.count ?? 0) : 0);
      })
      .catch(() => {
        if (live) setCount(0); // no count, no offer: the rule itself is already saved
      });
    return () => {
      live = false;
    };
  }, [categoryRef]);

  const confirm = async () => {
    if (busy) return;
    if (!on || !count) {
      onDone();
      return;
    }
    setBusy(true);
    setFailed(false);
    try {
      const res = await applyRuleToUnsettled(supabase, categoryRef);
      if (!res.ok) {
        hapticFailed();
        setFailed(true);
        return;
      }
      if (householdId) await qc.invalidateQueries({ queryKey: queryKeys.transactionsRoot(householdId) });
      hapticTap();
      showToast({ kind: 'ordinary', text: { key: 'household.rules.apply.applied', params: { count: res.changed_count ?? count } } });
      onDone();
    } catch {
      hapticFailed();
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  const meta = { ...textRole(pairing, 'label'), color: colors.inkMuted };
  return (
    <ConfirmSheet
      visible
      title={t('household.rules.apply.title')}
      body={t('household.rules.apply.body')}
      cancelLabel={t('household.rules.apply.keep')}
      confirmLabel={t(primaryLabelKey)}
      onConfirm={() => void confirm()}
      onCancel={onDone}
    >
      {count !== null && count > 0 ? (
        <>
          <ToggleRow label={t('household.rules.apply.toggle', { count })} value={on} onChange={setOn} />
          <Text style={meta}>{t('household.rules.apply.settledNote')}</Text>
        </>
      ) : null}
      {failed ? (
        <Text accessibilityRole="alert" style={[styles.fail, { color: colors.danger }]} testID="apply-failed">
          {t('household.rules.apply.failed')}
        </Text>
      ) : null}
    </ConfirmSheet>
  );
}

const styles = StyleSheet.create({
  fail: { marginTop: step.hair },
});
