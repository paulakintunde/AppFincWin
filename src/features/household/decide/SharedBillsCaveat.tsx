// 08.1-07 (D-37, UI-SPEC sections 3 and 6, OWNER-Q9: 30 days): when another member has not logged a shared line for more than 30 days, the
// Decide answer says shared costs may be higher. A `tight`-tint row with the stateTight glyph and the word "Shared bills" before the
// sentence. It never blocks. The name goes through the member resolver (a hidden name reads as its colour); the date is a date only.
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { usePartnerLastSharedLine } from '@/data/queries/partnerMoney';
import { useAuth } from '@/features/auth/AuthProvider';
import { useT } from '@/i18n';
import { useDeviceLocale } from '@/services/locale/deviceLocale';
import { radii, step } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { stateColors, stateMuted } from '@/theme/tokens';
import { fontSize, textRole } from '@/theme/typography';
import { Glyph } from '@/ui/icons/Glyph';
import { Text } from '@/ui/Text';
import { useMemberLabel } from '../useMemberLabel';

/** OWNER-Q9: older than this many days counts as "hasn't logged shared bills". */
export const SHARED_BILLS_STALE_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

function utcDay(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

/** True when the last shared line is more than 30 days before `today` (both YYYY-MM-DD). */
export function sharedBillsStale(lastDate: string, today: string): boolean {
  return (utcDay(today) - utcDay(lastDate)) / DAY_MS > SHARED_BILLS_STALE_DAYS;
}

/**
 * The first other member whose latest shared line is older than 30 days, or null. A member who has never logged one has no date to
 * name, so the caveat stays quiet for them rather than invent one.
 */
export function useStaleSharedBills(householdId: string | null | undefined, today: string): { partnerId: string; lastDate: string } | null {
  const { user } = useAuth();
  const { data } = usePartnerLastSharedLine(user?.id, householdId);
  for (const m of data ?? []) {
    if (m.last_date !== null && sharedBillsStale(m.last_date, today)) return { partnerId: m.member_id, lastDate: m.last_date };
  }
  return null;
}

export interface SharedBillsCaveatProps {
  householdId: string | null | undefined;
  /** The member who has not logged shared bills. */
  partnerId: string;
  /** Their latest shared line, YYYY-MM-DD. */
  lastDate: string;
}

export function SharedBillsCaveat({ householdId, partnerId, lastDate }: SharedBillsCaveatProps) {
  const t = useT();
  const { pairing } = useTheme();
  const { locale } = useDeviceLocale();
  const label = useMemberLabel(householdId);
  const name = label(partnerId);
  const date = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(utcDay(lastDate)));
  const tone = stateColors.tight;
  return (
    <View
      testID="shared-bills-caveat"
      accessible
      accessibilityRole="text"
      accessibilityLabel={t('household.members.partner.caveatSpoken', { name, date })}
      style={[styles.row, { backgroundColor: tone.tint }]}
    >
      <View style={styles.badge}>
        <Glyph name="stateTight" size={16} color={tone.color} />
        <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: tone.color }}>
          {t('household.members.partner.caveatBadge')}
        </Text>
      </View>
      <Text style={{ ...textRole(pairing, 'body'), color: stateMuted }}>{t('household.members.partner.caveat', { name, date })}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { padding: step.card, borderRadius: radii.card / 2, gap: step.hair },
  badge: { flexDirection: 'row', alignItems: 'center', gap: step.hair },
});
