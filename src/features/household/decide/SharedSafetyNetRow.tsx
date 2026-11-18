// 08.1-07 (D-36, UI-SPEC section 6): on Household home, a couple (exactly two members) can share one safety net. Off by default.
// Only the net's size and saved amount reach the other person, through the server (set_shared_safety_net).
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useOwnNetShares, useSetSharedSafetyNet } from '@/data/queries/partnerMoney';
import { useSavingsGoalRows } from '@/data/queries/growGoals';
import { useAuth } from '@/features/auth/AuthProvider';
import { useT } from '@/i18n';
import { radii, step } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { textRole } from '@/theme/typography';
import { hapticFailed, hapticTap } from '@/ui/haptics';
import { Text } from '@/ui/Text';
import { ToggleRow } from '@/ui/ToggleRow';

export interface SharedSafetyNetRowProps {
  householdId: string | null | undefined;
  /** How many people are in the household; the row shows for exactly two. */
  memberCount: number;
}

export function SharedSafetyNetRow({ householdId, memberCount }: SharedSafetyNetRowProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const { user } = useAuth();
  const userId = user?.id;
  const goals = useSavingsGoalRows(userId, householdId ?? undefined).data ?? [];
  const shares = useOwnNetShares(userId, householdId).data ?? [];
  const set = useSetSharedSafetyNet(userId, householdId);
  const [failed, setFailed] = React.useState(false);

  const net = goals.find((g) => g.is_safety_net === true && g.created_by === userId && g.deleted_at === null);
  if (memberCount !== 2 || !net) return null;
  const on = shares.some((s) => s.goal_id === net.id && s.enabled);
  const title = t('household.members.safetyNet.toggle');

  return (
    <View style={[styles.card, { backgroundColor: colors.surface }]} testID="shared-safety-net-row">
      <ToggleRow
        label={title}
        sub={t('household.members.safetyNet.helper')}
        value={on}
        disabled={set.isPending}
        accessibilityLabel={t('household.members.partner.rowSpoken', {
          label: title,
          state: on ? t('household.members.partner.stateOn') : t('household.members.partner.stateOff'),
        })}
        onChange={(next) => {
          setFailed(false);
          set.mutate(
            { goalId: net.id, enabled: next },
            {
              onSuccess: () => hapticTap(),
              onError: () => {
                hapticFailed();
                setFailed(true);
              },
            },
          );
        }}
      />
      {failed ? (
        <Text accessibilityRole="alert" style={{ ...textRole(pairing, 'label'), color: colors.danger }}>
          {t('household.members.safetyNet.failed')}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { marginTop: step.section, padding: step.card, borderRadius: radii.card, gap: step.tight },
});
