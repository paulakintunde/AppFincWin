// 08.1-07 (CMP-F19, D-36, UI-SPEC section 6): "Count {name}'s money in my Decide checks", one per other member, off by default and
// two-sided: it only takes effect when both people have switched it on. Turning off is immediate. The name goes through the
// member resolver, so a hidden name reads as its colour.
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { usePartnerOptins, useSetPartnerOptin } from '@/data/queries/partnerMoney';
import { useAuth } from '@/features/auth/AuthProvider';
import { useT } from '@/i18n';
import { step } from '@/theme/layout';
import { hapticFailed, hapticTap } from '@/ui/haptics';
import { StatusBadge } from '@/ui/status/StatusBadge';
import { Text } from '@/ui/Text';
import { ToggleRow } from '@/ui/ToggleRow';
import { useTheme } from '@/theme/ThemeProvider';
import { textRole } from '@/theme/typography';
import { useMemberLabel } from '../useMemberLabel';

export interface PartnerOptInRowProps {
  householdId: string | null | undefined;
  /** The other member this row is about. */
  partnerId: string;
}

export function PartnerOptInRow({ householdId, partnerId }: PartnerOptInRowProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const { user } = useAuth();
  const userId = user?.id;
  const qc = useQueryClient();
  const label = useMemberLabel(householdId);
  const optins = usePartnerOptins(userId, householdId).data ?? [];
  const set = useSetPartnerOptin(userId, householdId);
  const [failed, setFailed] = React.useState(false);

  const name = label(partnerId);
  const mine = optins.some((o) => o.owner_id === userId && o.partner_id === partnerId && o.enabled);
  const theirs = optins.some((o) => o.owner_id === partnerId && o.partner_id === userId && o.enabled);
  const both = mine && theirs;
  const state = both
    ? t('household.members.partner.onForBoth')
    : mine
      ? t('household.members.partner.waiting', { name })
      : t('household.members.partner.stateOff');
  const title = t('household.members.partner.countInDecide', { name });

  const onChange = (next: boolean) => {
    setFailed(false);
    set.mutate(
      { partnerId, enabled: next },
      {
        onSuccess: () => {
          hapticTap();
          void qc.invalidateQueries({ queryKey: ['partner-money'] });
        },
        onError: () => {
          hapticFailed();
          setFailed(true);
        },
      },
    );
  };

  return (
    <View style={styles.column} testID="partner-optin-row">
      <ToggleRow
        label={title}
        sub={t('household.members.partner.helper', { name })}
        value={mine}
        onChange={onChange}
        disabled={set.isPending}
        accessibilityLabel={t('household.members.partner.rowSpoken', { label: title, state })}
      />
      {mine ? (
        both ? (
          <StatusBadge status="fits" label={t('household.members.partner.onForBoth')} testID="partner-optin-both" />
        ) : (
          <StatusBadge status="notYet" label={t('household.members.partner.waiting', { name })} testID="partner-optin-waiting" />
        )
      ) : null}
      {failed ? (
        <Text accessibilityRole="alert" style={{ ...textRole(pairing, 'label'), color: colors.danger }}>
          {t('household.members.partner.failed')}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  column: { gap: step.tight },
});
