// Screen 7 (HH-04, D-30, D-34): the weights editor. A WeightRow per member in join order; every change goes through
// rebalanceWeights so the set always totals 100. 0% is allowed; the last positive weight cannot go to 0. Any member can save.
// After a save the sheet toasts "Weights saved" with Undo (puts the old weights back) and calls onSaved(before) so the
// rules plan (08-20) can open the apply-to-existing offer (D-35).
import React, { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { Text } from '@/ui/Text';
import { Pill } from '@/ui/Pill';
import { Sheet, SheetScroll } from '@/ui/Sheet';
import { SheetHeader } from '@/ui/SheetHeader';
import { StatusBadge } from '@/ui/status/StatusBadge';
import { Glyph } from '@/ui/icons/Glyph';
import { FadeIn } from '@/ui/motion/FadeIn';
import { hapticFailed, hapticTap, hapticWarn } from '@/ui/haptics';
import { useIsDirty } from '@/ui/useIsDirty';
import { useSettledLabel } from '@/ui/useSettledLabel';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { step } from '@/theme/layout';
import { textRole } from '@/theme/typography';
import { queryKeys } from '@/data/keys';
import { useHouseholdMembers } from '@/data/queries/household';
import { setMemberWeights } from '@/db/householdMembers';
import { rebalanceWeights } from '@/engine/household/weights';
import { supabase } from '@/services/supabase';
import { showToast } from '@/state/undoToast';
import { WeightRow } from './components/WeightRow';

export interface WeightsSheetProps {
  visible: boolean;
  householdId: string | null | undefined;
  onClose: () => void;
  /** Called after a successful save with the weights as they were (user id to percent). */
  onSaved?: (before: Record<string, number>) => void;
}

export function WeightsSheet({ visible, householdId, onClose, onSaved }: WeightsSheetProps) {
  if (!visible) return null;
  return <WeightsBody householdId={householdId} onClose={onClose} onSaved={onSaved} />;
}

type ReasonKey =
  | 'household.members.reasons.members_mismatch'
  | 'household.members.weights.lastHolder'
  | 'household.members.reasons.not_member'
  | 'household.members.reasons.weights_invalid'
  | 'household.members.reasons.failed';

function reasonKey(reason: string): ReasonKey {
  if (reason === 'members_mismatch') return 'household.members.reasons.members_mismatch';
  if (reason === 'all_zero') return 'household.members.weights.lastHolder';
  if (reason === 'not_member') return 'household.members.reasons.not_member';
  if (reason === 'invalid_weight' || reason === 'not_100') return 'household.members.reasons.weights_invalid';
  return 'household.members.reasons.failed';
}

function WeightsBody({ householdId, onClose, onSaved }: Omit<WeightsSheetProps, 'visible'>) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const qc = useQueryClient();
  const { data: members } = useHouseholdMembers(householdId);
  const ids = useMemo(() => (members ?? []).map((m) => m.user_id), [members]);
  const before = useMemo<Record<string, number>>(
    () => Object.fromEntries((members ?? []).map((m) => [m.user_id, m.weight])),
    [members],
  );
  const [edited, setEdited] = useState<readonly number[] | null>(null);
  const weights = edited ?? (members ?? []).map((m) => m.weight);
  const [lastHolder, setLastHolder] = useState(false);
  const [failure, setFailure] = useState<ReasonKey | null>(null);
  const [saving, setSaving] = useState(false);
  const [initial] = useState(() => (members ?? []).map((m) => m.weight));
  const dirty = useIsDirty(initial, weights);
  const title = t('household.members.weights.title');
  const changed = ids.some((id, i) => weights[i] !== before[id]);

  // D-56 a11y: the total is a polite live region that only speaks once the numbers stop moving.
  const totalWords = t('household.members.weights.total');
  const spoken = useSettledLabel(lastHolder ? `${totalWords}. ${t('household.members.weights.lastHolder')}` : totalWords, lastHolder ? 'warn' : 'ok', 600);

  const change = (index: number, next: number) => {
    if (ids.length < 2) return;
    setFailure(null);
    const result = rebalanceWeights(weights, index, next);
    if (!result.ok) {
      // last_positive: the value stays, the helper says why.
      setLastHolder(true);
      hapticWarn();
      return;
    }
    setLastHolder(false);
    setEdited(result.weights);
  };

  const save = async () => {
    if (saving || !changed || householdId == null) return;
    setSaving(true);
    setFailure(null);
    try {
      const next = Object.fromEntries(ids.map((id, i) => [id, weights[i] as number]));
      const res = await setMemberWeights(supabase, next);
      if (!res.ok) {
        hapticFailed();
        setFailure(reasonKey(res.reason));
        return;
      }
      await qc.invalidateQueries({ queryKey: queryKeys.householdMembers(householdId) });
      hapticTap();
      showToast({
        kind: 'ordinary',
        text: { key: 'household.members.weights.saved' },
        onUndo: () => {
          void setMemberWeights(supabase, before).then(() => qc.invalidateQueries({ queryKey: queryKeys.householdMembers(householdId) }));
        },
      });
      onSaved?.(before);
      onClose();
    } catch {
      hapticFailed();
      setFailure('household.members.reasons.failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet visible onDismiss={onClose} accessibilityLabel={title} dirty={dirty}>
      <SheetHeader title={title} cancelLabel={t('record.sheet.cancel')} onCancel={onClose} />
      <SheetScroll contentContainerStyle={styles.column}>
        {ids.map((id, i) => (
          <WeightRow
            key={id}
            householdId={householdId}
            userId={id}
            percent={weights[i] as number}
            onChange={(n) => change(i, n)}
            disabled={ids.length < 2}
          />
        ))}
        <View accessibilityLiveRegion="polite" accessible accessibilityLabel={spoken} style={styles.total}>
          <StatusBadge status="paid" label={totalWords} testID="weights-total" />
        </View>
        {lastHolder ? (
          <FadeIn>
            <View style={styles.warn} testID="weights-last-holder">
              <Glyph name="stateTight" size={16} color={colors.warn1} />
              <Text style={{ ...textRole(pairing, 'label'), color: colors.warn1, flexShrink: 1 }}>
                {t('household.members.weights.lastHolder')}
              </Text>
            </View>
          </FadeIn>
        ) : null}
        {failure ? (
          <Text accessibilityRole="alert" style={{ ...textRole(pairing, 'label'), color: colors.danger }} testID="weights-failure">
            {t(failure)}
          </Text>
        ) : null}
        <Pill
          label={t('household.members.weights.save')}
          variant="primary"
          onPress={() => void save()}
          disabled={!changed}
          pending={saving}
        />
      </SheetScroll>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  column: { gap: step.tight },
  total: { paddingVertical: step.tight },
  warn: { flexDirection: 'row', alignItems: 'center', gap: step.hair },
});
