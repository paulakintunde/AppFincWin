/**
 * SYN-06: the You-screen sync status line (D-14) -- 'offline · 3 changes queued' /
 * 'synced 2 minutes ago', plus failed/conflict counts when present. Re-renders every 30s
 * so "minutes ago" advances without the user touching anything.
 */
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/ui/Text';
import { useSyncStatus } from '@/data/sync/useSyncStatus';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { fontSize, textRole } from '@/theme/typography';
import { space } from '@/theme/layout';
import { FailedWritesSheet } from './FailedWritesSheet';
import { syncStatusLabel } from './syncStatusLabel';

const TICK_MS = 30_000;

export function SyncStatusLine() {
  const t = useT();
  const { colors, pairing } = useTheme();
  const status = useSyncStatus();
  const [now, setNow] = useState(() => Date.now());
  const [listOpen, setListOpen] = useState(false);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, []);

  const { primary, failed, conflicts } = syncStatusLabel(status, now);

  const labelStyle = {
    ...textRole(pairing, 'label'),
    fontSize: fontSize.meta,
    color: colors.inkMuted,
  };
  const dangerStyle = { ...labelStyle, color: colors.danger };

  return (
    <View style={styles.column}>
      <Text style={labelStyle}>{t(primary.key, { count: primary.count })}</Text>
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
