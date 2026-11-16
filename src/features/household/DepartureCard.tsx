// Screen 1 / Screen 11 (D-26): for 24 hours after the owner removes someone, the Household home says so and offers
// "Invite again", which asks the server for a fresh invite tied to that departure (reconnecting their lines on redeem).
// Owner only; the server refuses anyone else. The name goes through the resolver (D-32).
import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Text } from '@/ui/Text';
import { Glyph } from '@/ui/icons/Glyph';
import { hapticFailed } from '@/ui/haptics';
import { LINK_HIT_SLOP } from '@/ui/pressFeedback';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { iconSize, radii, space, step } from '@/theme/layout';
import { textRole } from '@/theme/typography';
import { fetchOpenDepartures, reinviteRemoved } from '@/db/memberDepartures';
import { supabase } from '@/services/supabase';
import { householdIcons } from './glyphs';
import { ownerReasonKey, type OwnerReasonKey } from './ownerReasons';
import { useMemberLabel } from './useMemberLabel';

export interface DepartureCardProps {
  householdId: string | null | undefined;
  isOwner: boolean;
  online: boolean;
  /** The invite the server made for the removed person. */
  onInvite: (code: string, expiresAt: string) => void;
}

export function DepartureCard({ householdId, isOwner, online, onInvite }: DepartureCardProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const label = useMemberLabel(householdId);
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<OwnerReasonKey | null>(null);
  const { data } = useQuery({
    queryKey: ['household', householdId ?? '', 'departures'],
    queryFn: () => fetchOpenDepartures(supabase, householdId as string),
    enabled: Boolean(householdId) && isOwner,
  });

  if (!isOwner || !data || data.length === 0) return null;

  const again = async (id: string) => {
    if (busy || !online) return;
    setBusy(id);
    setFailure(null);
    try {
      const res = await reinviteRemoved(supabase, id);
      if (res.ok) {
        onInvite(res.code, res.expires_at);
      } else {
        hapticFailed();
        setFailure(ownerReasonKey(res.reason));
      }
    } catch {
      hapticFailed();
      setFailure('household.home.reasons.failed');
    } finally {
      setBusy(null);
    }
  };

  return (
    <View>
      {data.map((d) => {
        const name = label(d.user_id);
        return (
          <View key={d.id} testID="departure-card" style={[styles.card, { backgroundColor: colors.surface }]}>
            <View style={styles.head}>
              <Glyph name={householdIcons.person} size={iconSize.row} color={colors.inkDim} />
              <Text style={[styles.body, { ...textRole(pairing, 'body'), color: colors.ink }]}>
                {t('household.join.departure.body', { name })}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: !online || busy !== null }}
              disabled={!online || busy !== null}
              hitSlop={LINK_HIT_SLOP}
              onPress={() => void again(d.id)}
              style={styles.action}
            >
              <Text style={{ ...textRole(pairing, 'body'), color: online ? colors.accent : colors.inkFaint }}>
                {t('household.join.departure.again')}
              </Text>
            </Pressable>
            {!online ? <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>{t('household.home.offline.helper')}</Text> : null}
          </View>
        );
      })}
      {failure ? (
        <Text accessibilityRole="alert" style={{ ...textRole(pairing, 'label'), color: colors.danger }}>
          {t(failure)}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: step.card, borderRadius: radii.card, gap: step.tight },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: step.row },
  body: { flex: 1, flexShrink: 1 },
  action: { minHeight: space.touchMin, justifyContent: 'center', alignSelf: 'flex-start' },
});
