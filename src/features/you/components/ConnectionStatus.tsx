// D-13/ENV-03: a live Supabase reachability indicator. Checks on mount and again whenever the
// app returns to the foreground, so a connection regained while backgrounded is reflected
// without a manual refresh. Latency is measured (checkConnection's ok result) but never
// shown — only the three-state label and dot matter here.
import { useEffect, useState } from 'react';
import { AppState, type AppStateStatus, StyleSheet, Text, View } from 'react-native';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { checkConnection, type ConnectionResult } from '@/services/supabase';
import { fontSize } from '@/theme/typography';
import { space } from '@/theme/layout';

type Status = 'checking' | ConnectionResult;

export function ConnectionStatus() {
  const t = useT();
  const { colors, fonts } = useTheme();
  const [status, setStatus] = useState<Status>('checking');

  useEffect(() => {
    let cancelled = false;

    function run(): void {
      setStatus('checking');
      checkConnection().then((result) => {
        if (!cancelled) setStatus(result);
      });
    }

    run();

    const subscription = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'active') run();
    });

    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, []);

  const ok = status !== 'checking' && status.ok;
  const isError = status !== 'checking' && !status.ok;
  const label =
    status === 'checking'
      ? t('you.connection.checking')
      : status.ok
        ? t('you.connection.ok')
        : t('you.connection.error');

  return (
    <View style={styles.row}>
      <View style={[styles.dot, { backgroundColor: ok ? colors.accent : colors.inkSoft1 }]} />
      <Text
        style={[
          styles.label,
          { fontFamily: fonts.body[500], color: isError ? colors.inkMuted : colors.ink },
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.gapSm,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  label: {
    fontSize: fontSize.body,
  },
});
