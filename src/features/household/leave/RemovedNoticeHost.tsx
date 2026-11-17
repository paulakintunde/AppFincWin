// Screen 11 (D-28, T-08-89): a person the owner removed is told once, calmly, with one sheet: "You're no longer in [household]".
// The server writes a `removed` event in the person's NEW household (audience: them), naming the old household in
// params.household_name. This host is mounted once in the (app) layout, next to the live channel host: it reads the
// viewer's current household's events, and when an unseen `removed` event about the viewer is there, shows the sheet. That
// happens on the next open, or at once when the live channel resets the household scope (applyEvent). If a Household
// screen is open at that moment it is replaced by Home first (UI-SPEC Error states). "Got it" (or a swipe down) marks it
// seen on this device. Its own module so layout wiring tests can stand it in without the data layer.
import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router, usePathname, type Href } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Text } from '@/ui/Text';
import { Pill } from '@/ui/Pill';
import { Sheet } from '@/ui/Sheet';
import { IconTile } from '@/ui/icons/IconTile';
import { accentTintOver } from '@/ui/EmptyState';
import { hapticTap } from '@/ui/haptics';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { step, tile } from '@/theme/layout';
import { textRole } from '@/theme/typography';
import { useHouseholdEvents, useHouseholdId } from '@/data/queries/household';
import type { HouseholdEventRow } from '@/db/householdEvents';
import { useAuth } from '@/features/auth/AuthProvider';
import { householdIcons } from '../glyphs';

/** The device-local "already told" mark for one removal event. */
export const removedSeenKey = (eventId: string): string => `fincwin.removedSeen.${eventId}`;

function householdName(e: HouseholdEventRow): string {
  const name = e.params?.household_name;
  return typeof name === 'string' ? name : '';
}

export function RemovedNoticeHost() {
  const t = useT();
  const { colors, pairing } = useTheme();
  const pathname = usePathname();
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const householdId = useHouseholdId(userId ?? undefined).data ?? null;
  const { events } = useHouseholdEvents(householdId, userId ?? undefined);
  const removal = userId === null ? undefined : events.find((e) => e.kind === 'removed' && e.subject_id === userId);
  const removalId = removal?.id ?? null;
  const [shown, setShown] = useState<HouseholdEventRow | null>(null);

  useEffect(() => {
    if (!removal || removalId === null) return;
    let live = true;
    void (async () => {
      let seen = false;
      try {
        seen = (await AsyncStorage.getItem(removedSeenKey(removalId))) !== null;
      } catch {
        // Unreadable mark: tell the person (once more rather than never).
      }
      if (!live || seen) return;
      // The open Household screen belonged to the old household: replace it with Home first.
      if (pathname.startsWith('/household')) router.navigate('/home' as Href);
      setShown(removal);
    })();
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once per removal event, not per path or row identity
  }, [removalId]);

  const done = () => {
    const id = shown?.id;
    setShown(null);
    hapticTap();
    if (id) void AsyncStorage.setItem(removedSeenKey(id), '1').catch(() => undefined);
  };

  const household = shown ? householdName(shown) : '';
  return (
    <Sheet visible={shown !== null} onDismiss={done} accessibilityLabel={t('household.leave.noLonger.title', { household })}>
      <View style={styles.column} testID="removed-notice">
        <IconTile icon={householdIcons.people} color={colors.accent} tint={accentTintOver(colors.fill1, colors.accent)} size={tile.big} />
        <Text accessibilityRole="header" style={{ ...textRole(pairing, 'sheetTitle'), color: colors.ink }}>
          {t('household.leave.noLonger.title', { household })}
        </Text>
        <Text style={{ ...textRole(pairing, 'body'), color: colors.ink }}>{t('household.leave.noLonger.body')}</Text>
        <Pill label={t('household.leave.noLonger.gotIt')} variant="primary" onPress={done} />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  column: { gap: step.card },
});
