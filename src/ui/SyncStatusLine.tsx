/**
 * SYN-06 / D-88: the sync status line. Quiet unless a write is slow or something failed: hidden while every
 * write is younger than 5 s, then 'Saving…' / '3 changes waiting' / 'offline · 3 changes waiting', plus failed
 * and conflict counts when present. The expanded detail (`detail`) also reads 'synced 2 minutes ago'.
 *
 * Two timers keep it live with no other change: one fires when a pending write crosses 5 s, and a 30 s
 * interval advances 'minutes ago'. Each only sets a timer; the state tick is set from the callback.
 */
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Text } from '@/ui/Text';
import { useSyncStatus } from '@/data/sync/useSyncStatus';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { fontSize, textRole } from '@/theme/typography';
import { space } from '@/theme/layout';
import { FailedWritesSheet } from './FailedWritesSheet';
import { nextSyncLineChangeAt, syncStatusLabel } from './syncStatusLabel';

const TICK_MS = 30_000;

interface Props {
  /** The expanded sync detail: also shows 'synced … ago' when the line would otherwise be hidden. */
  detail?: boolean;
  /** Wraps the line; rendered only while the line has something to say (so a header gap never shows for nothing). */
  wrapperStyle?: StyleProp<ViewStyle>;
  wrapperTestID?: string;
}

export function SyncStatusLine({ detail = false, wrapperStyle, wrapperTestID }: Props = {}) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const status = useSyncStatus();
  const [now, setNow] = useState(() => Date.now());
  const [listOpen, setListOpen] = useState(false);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, []);

  // D-88: when a pending write will cross 5 s. Null once none is still young.
  const dueAt = nextSyncLineChangeAt(status, now);
  useEffect(() => {
    if (dueAt === null) return;
    const id = setTimeout(() => setNow(Date.now()), Math.max(0, dueAt - Date.now()));
    return () => clearTimeout(id);
  }, [dueAt]);

  const { primary, failed, conflicts } = syncStatusLabel(status, now, detail);
  // An open failed-saves list stays mounted even if its last entry clears while the user is in it.
  if (primary === null && failed === 0 && conflicts === 0 && !listOpen) return null;

  const labelStyle = {
    ...textRole(pairing, 'label'),
    fontSize: fontSize.meta,
    color: colors.inkMuted,
  };
  const dangerStyle = { ...labelStyle, color: colors.danger };

  const line = (
    <View style={styles.column}>
      {primary ? <Text style={labelStyle}>{t(primary.key, { count: primary.count })}</Text> : null}
      {failed > 0 ? (
        <Pressable accessibilityRole="button" accessibilityHint={t('sync.failedSheet.openHint')} onPress={() => setListOpen(true)} style={styles.button}>
          <Text style={dangerStyle}>{t('sync.failed', { count: failed })}</Text>
        </Pressable>
      ) : null}
      {conflicts > 0 ? (
        <Pressable accessibilityRole="button" accessibilityHint={t('sync.failedSheet.openHint')} onPress={() => setListOpen(true)} style={styles.button}>
          <Text style={dangerStyle}>{t('sync.conflict', { count: conflicts })}</Text>
        </Pressable>
      ) : null}
      {listOpen ? <FailedWritesSheet visible onClose={() => setListOpen(false)} /> : null}
    </View>
  );

  if (wrapperStyle === undefined && wrapperTestID === undefined) return line;
  return (
    <View testID={wrapperTestID} style={wrapperStyle}>
      {line}
    </View>
  );
}

const styles = StyleSheet.create({
  column: {
    gap: 2,
  },
  button: {
    minHeight: space.touchMin,
    justifyContent: 'center',
  },
});
