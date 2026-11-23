/**
 * 10-22 (ALR-05, UI-SPEC 5b): the last 30 days of alerts, newest first, grouped by day, including ones held for quiet
 * hours. Text is built from whitelisted params only (alertText), so a partner's note or payee cannot appear (D-12).
 */
import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { useT } from '@/i18n';
import { useAlertLog, useAlertPrefs } from '@/data/queries/alerts';
import type { AlertLogEntry } from '@/db/alerts';
import { useRecordContext } from '@/features/record/useRecordContext';
import { useBackHistory } from '@/shell/backHistory/BackHistoryProvider';
import { BackButton } from '@/shell/header/BackButton';
import { useDeviceLocale } from '@/services/locale/deviceLocale';
import { EmptyState, accentTintOver } from '@/ui/EmptyState';
import { Row } from '@/ui/Row';
import { Screen } from '@/ui/Screen';
import { Text } from '@/ui/Text';
import { IconTile } from '@/ui/icons/IconTile';
import { localDayOf } from '@/ui/localDay';
import { useMoneyFormatter } from '@/ui/money/useMoneyFormatter';
import { StatusBadge } from '@/ui/status/StatusBadge';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/layout';
import { textRole } from '@/theme/typography';
import { alertText } from './alertText';

interface Group {
  day: string;
  entries: AlertLogEntry[];
}

export function groupByDay(entries: readonly AlertLogEntry[], timeZone: string): Group[] {
  const groups: Group[] = [];
  for (const e of entries) {
    const day = localDayOf(e.raisedAt, timeZone) ?? e.raisedAt.slice(0, 10);
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.entries.push(e);
    else groups.push({ day, entries: [e] });
  }
  return groups;
}

export function AlertLogScreen() {
  const t = useT();
  const { colors, pairing } = useTheme();
  const { goBack } = useBackHistory();
  const ctx = useRecordContext();
  const userId = ctx.userId ?? undefined;
  const { locale } = useDeviceLocale();
  const { formatMoney, formatDate } = useMoneyFormatter(ctx.showCents, ctx.homeCurrency);
  const log = useAlertLog(userId).data;
  const zone = useAlertPrefs(userId).data?.timeZone ?? ctx.timeZone;
  const groups = useMemo(() => groupByDay(log ?? [], zone), [log, zone]);
  const tint = accentTintOver(colors.fill1, colors.accent);
  const tr = t as unknown as (key: string, options?: Record<string, string | number>) => string;

  return (
    <Screen scroll>
      <View style={styles.back}>
        <BackButton variant="compact" onPress={goBack} />
      </View>
      <View style={styles.column} testID="alert-log-screen">
        <Text accessibilityRole="header" style={{ ...textRole(pairing, 'heading'), color: colors.ink }}>
          {t('system.alerts.logTitle')}
        </Text>
        {groups.length === 0 ? (
          <EmptyState icon="alerts" heading={t('system.alerts.logEmptyTitle')} body={t('system.alerts.logEmptyBody')} testID="alert-log-empty" />
        ) : (
          groups.map((g) => (
            <View key={g.day} style={styles.group}>
              <Text accessibilityRole="header" style={{ ...textRole(pairing, 'sheetTitle'), color: colors.ink }}>
                {formatDate(g.day, 'long')}
              </Text>
              {g.entries.map((e) => {
                const at = new Date(e.deliveredAt ?? e.raisedAt).toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' });
                return (
                  <Row
                    key={e.id}
                    label={alertText(e, tr, formatMoney)}
                    sublabel={at}
                    leading={<IconTile icon="alerts" color={colors.accent} tint={tint} />}
                    status={e.heldForQuiet ? <StatusBadge status="quietHeld" /> : undefined}
                    statusText={e.heldForQuiet ? t('appLife.status.quietHeld') : undefined}
                  />
                );
              })}
            </View>
          ))
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  back: { marginBottom: space.gapSm },
  column: { gap: space.groupGap, paddingBottom: space.sheetPadBottom },
  group: { gap: space.gapSm },
});
