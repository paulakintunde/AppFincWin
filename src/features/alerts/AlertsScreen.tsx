/**
 * 10-22 (ALR-01..04, D-09..D-12, UI-SPEC section 5): the Alerts settings screen.
 * Notification permission is asked only when the person switches an alert on, through the pre-ask sheet (D-09). Opening
 * this screen reads the OS answer but never asks.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Linking, Platform, StyleSheet, View } from 'react-native';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import type { Href } from 'expo-router';
import { useT } from '@/i18n';
import { ALERT_KINDS, DEFAULT_ALERT_PREFS, DEFAULT_ALERT_SETTINGS, type AlertKind, type AlertSetting } from '@/db/alerts';
import { currencyCode, minorUnits } from '@/engine/money';
import { useAlertPrefs, useAlertSettings } from '@/data/queries/alerts';
import { useSaveAlertPrefs, useSaveAlertSetting } from '@/data/mutations/alertSettings';
import { useHouseholdScope } from '@/features/household/useHouseholdScope';
import { useFeatureAccess } from '@/features/levels/useFeatureAccess';
import { NoticeCard } from '@/features/plans/components/NoticeCard';
import { useRecordContext } from '@/features/record/useRecordContext';
import { SettingsGroup } from '@/features/you/components/SettingsGroup';
import { useBackHistory } from '@/shell/backHistory/BackHistoryProvider';
import { BackButton } from '@/shell/header/BackButton';
import { pushOnce } from '@/shell/navigation/pushOnce';
import { useDeviceLocale } from '@/services/locale/deviceLocale';
import { RadioDot } from '@/ui/RadioDot';
import { Row } from '@/ui/Row';
import { Screen } from '@/ui/Screen';
import { Text } from '@/ui/Text';
import { ToggleRow } from '@/ui/ToggleRow';
import { accentTintOver } from '@/ui/EmptyState';
import { IconTile } from '@/ui/icons/IconTile';
import { hapticTick } from '@/ui/haptics';
import { useMoneyFormatter } from '@/ui/money/useMoneyFormatter';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/layout';
import { textRole } from '@/theme/typography';
import { AlertKindRow } from './AlertKindRow';
import { AlertKindSheet } from './AlertKindSheet';
import { PermissionPreAsk } from './PermissionPreAsk';
import { useAlertDefaults } from './useAlertDefaults';
import { getPushPermission, requestPushPermissionAndRegister, type PushPermission } from './pushRegistration';

const ALERT_LOG_HREF = '/alert-log' as Href;

const KIND_LABEL: Record<AlertKind, string> = {
  bills_due: 'system.alerts.kind.billsDue',
  goal_reached: 'system.alerts.kind.goalReached',
  over_cap: 'system.alerts.kind.overCap',
  large_txn: 'system.alerts.kind.largeTransaction',
  low_balance: 'system.alerts.kind.lowBalance',
};
/** UI-SPEC order. */
const ORDER: readonly AlertKind[] = ['bills_due', 'goal_reached', 'over_cap', 'large_txn', 'low_balance'];

function hhmmToDate(hhmm: string): Date {
  const [h = 0, m = 0] = hhmm.split(':').map(Number);
  return new Date(2000, 0, 1, h, m, 0);
}
function dateToHhmm(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function AlertsScreen() {
  const t = useT();
  const { colors, pairing } = useTheme();
  const { goBack } = useBackHistory();
  const ctx = useRecordContext();
  const scope = useHouseholdScope();
  const userId = ctx.userId ?? undefined;
  const { locale } = useDeviceLocale();
  const { formatMoney } = useMoneyFormatter(ctx.showCents, ctx.homeCurrency);
  const settingsData = useAlertSettings(userId).data;
  const prefsData = useAlertPrefs(userId).data;
  const { saveAlertSetting } = useSaveAlertSetting();
  const { saveAlertPrefs } = useSaveAlertPrefs();
  const { suggested, homeCurrency, ensurePartnerThreshold } = useAlertDefaults(userId);
  const caps = useFeatureAccess('caps');

  const settings: AlertSetting[] = settingsData ?? ALERT_KINDS.map((k) => DEFAULT_ALERT_SETTINGS[k]);
  const prefs = prefsData ?? DEFAULT_ALERT_PREFS;
  const byKind = (k: AlertKind): AlertSetting => settings.find((s) => s.kind === k) ?? DEFAULT_ALERT_SETTINGS[k];
  const inHousehold = scope.members.length >= 2;

  const [permission, setPermission] = useState<PushPermission>('undetermined');
  const [preAsk, setPreAsk] = useState(false);
  const [asking, setAsking] = useState(false);
  const [sheetKind, setSheetKind] = useState<AlertKind | null>(null);
  const [picker, setPicker] = useState<'start' | 'end' | null>(null);

  // Reads the OS answer only. Never asks (D-09).
  useEffect(() => {
    let live = true;
    void getPushPermission().then((p) => {
      if (live) setPermission(p);
    });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (inHousehold) ensurePartnerThreshold();
  }, [inHousehold, ensurePartnerThreshold]);

  const saveKind = useCallback(
    (kind: AlertKind, patch: Partial<Omit<AlertSetting, 'kind' | 'version'>>) => {
      if (!userId) return;
      const cur = byKind(kind);
      saveAlertSetting({
        userId,
        setting: {
          kind,
          enabled: patch.enabled ?? cur.enabled,
          thresholdMinor: patch.thresholdMinor ?? cur.thresholdMinor,
          thresholdCurrency: patch.thresholdCurrency ?? cur.thresholdCurrency,
          leadDays: patch.leadDays ?? cur.leadDays,
        },
        baseVersion: cur.version,
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [userId, settings, saveAlertSetting]
  );

  const toggleKind = (kind: AlertKind, next: boolean) => {
    const patch: Partial<Omit<AlertSetting, 'kind' | 'version'>> = { enabled: next };
    if (next && (kind === 'large_txn' || kind === 'low_balance') && byKind(kind).thresholdMinor === null) {
      const s = kind === 'large_txn' ? suggested.large : suggested.low;
      patch.thresholdMinor = s.minor;
      patch.thresholdCurrency = homeCurrency;
    }
    saveKind(kind, patch);
    if (next && permission !== 'granted') setPreAsk(true);
  };

  const onContinue = async () => {
    setAsking(true);
    try {
      setPermission((await requestPushPermissionAndRegister()) === 'granted' ? 'granted' : 'denied');
    } finally {
      setAsking(false);
      setPreAsk(false);
    }
  };

  const savePrefs = (patch: Parameters<typeof saveAlertPrefs>[0]['patch']) => {
    if (!userId) return;
    saveAlertPrefs({ userId, patch, baseVersion: prefs.version });
  };

  const timeText = (hhmm: string) =>
    hhmmToDate(hhmm).toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' });

  const onPick = (which: 'start' | 'end') => (event: DateTimePickerEvent, date?: Date) => {
    if (Platform.OS === 'android') setPicker(null);
    if (event.type === 'set' && date) savePrefs(which === 'start' ? { quietStart: dateToHhmm(date) } : { quietEnd: dateToHhmm(date) });
  };

  const amountOf = (s: AlertSetting, fallback: number) =>
    formatMoney({ amount: minorUnits(s.thresholdMinor ?? fallback), currency: currencyCode(s.thresholdCurrency ?? homeCurrency) });

  const subFor = (kind: AlertKind): string => {
    const s = byKind(kind);
    switch (kind) {
      case 'bills_due':
        return t(s.leadDays === 0 ? 'system.alerts.kindSub.billsDueSame' : s.leadDays === 3 ? 'system.alerts.kindSub.billsDueThree' : 'system.alerts.kindSub.billsDueOne');
      case 'goal_reached':
        return t('system.alerts.kindSub.goalReached');
      case 'over_cap':
        return t('system.alerts.kindSub.overCap');
      case 'large_txn':
        return t('system.alerts.kindSub.largeTransaction', { amount: amountOf(s, suggested.large.minor) });
      case 'low_balance':
        return t('system.alerts.kindSub.lowBalance', { amount: amountOf(s, suggested.low.minor) });
    }
  };

  const capsOff = !caps.on;
  const anyOn = settings.some((s) => s.enabled);
  const muted = { ...textRole(pairing, 'label'), color: colors.inkMuted };
  const sheetSetting = sheetKind ? byKind(sheetKind) : null;

  return (
    <Screen scroll>
      <View style={styles.back}>
        <BackButton variant="compact" onPress={goBack} />
      </View>
      <View style={styles.column} testID="alerts-screen">
        <Text accessibilityRole="header" style={{ ...textRole(pairing, 'heading'), color: colors.ink }}>
          {t('system.alerts.title')}
        </Text>

        {permission === 'denied' && anyOn ? (
          <NoticeCard
            testID="alerts-permission-card"
            title={t('system.alerts.permissionTitle')}
            body={t('system.alerts.permissionBody')}
            actions={[{ label: t('system.alerts.permissionAction'), kind: 'link', onPress: () => void Linking.openSettings() }]}
          />
        ) : null}

        <SettingsGroup title={t('system.alerts.group')}>
          {ORDER.map((kind) => {
            const s = byKind(kind);
            const disabled = kind === 'over_cap' && capsOff;
            return (
              <AlertKindRow
                key={kind}
                kindId={kind}
                label={t(KIND_LABEL[kind] as never)}
                sub={disabled ? t('system.alerts.needsCaps') : subFor(kind)}
                enabled={s.enabled}
                disabled={disabled}
                onToggle={(next) => toggleKind(kind, next)}
                onOpen={() => setSheetKind(kind)}
              />
            );
          })}
        </SettingsGroup>

        <SettingsGroup title={t('system.alerts.deliveryGroup')}>
          <View accessibilityRole="radiogroup" accessibilityLabel={t('system.alerts.deliveryGroup')}>
            <Row
              label={t('system.alerts.deliveryInstant')}
              selected={prefs.mode === 'instant'}
              leading={<RadioDot selected={prefs.mode === 'instant'} />}
              onPress={() => {
                hapticTick();
                savePrefs({ mode: 'instant' });
              }}
            />
            <Row
              label={t('system.alerts.deliveryDaily')}
              sublabel={t('system.alerts.deliveryDailySub')}
              selected={prefs.mode === 'digest'}
              leading={<RadioDot selected={prefs.mode === 'digest'} />}
              onPress={() => {
                hapticTick();
                savePrefs({ mode: 'digest' });
              }}
            />
          </View>
        </SettingsGroup>

        <SettingsGroup title={t('system.alerts.quietGroup')}>
          <ToggleRow
            label={t('system.alerts.quietToggle')}
            value={prefs.quietEnabled}
            onChange={(next) => {
              hapticTick();
              savePrefs({ quietEnabled: next });
            }}
          />
          {prefs.quietEnabled ? (
            <Row
              label={t('system.alerts.quietFrom', { time: timeText(prefs.quietStart) })}
              accessibilityLabel={t('system.alerts.quietFromLabel')}
              chevron
              onPress={() => setPicker(picker === 'start' ? null : 'start')}
            />
          ) : null}
          {prefs.quietEnabled ? (
            <Row
              label={t('system.alerts.quietTo', { time: timeText(prefs.quietEnd) })}
              accessibilityLabel={t('system.alerts.quietToLabel')}
              chevron
              onPress={() => setPicker(picker === 'end' ? null : 'end')}
            />
          ) : null}
        </SettingsGroup>
        {picker ? (
          <DateTimePicker
            testID="quiet-time-picker"
            value={hhmmToDate(picker === 'start' ? prefs.quietStart : prefs.quietEnd)}
            mode="time"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onChange={onPick(picker)}
          />
        ) : null}
        <Text style={muted}>{t('system.alerts.quietMeta')}</Text>

        {inHousehold ? (
          <SettingsGroup title={t('system.alerts.partnerToggle')}>
            <ToggleRow
              label={t('system.alerts.partnerToggle')}
              sub={t('system.alerts.partnerSub')}
              value={prefs.partnerAlerts}
              onChange={(next) => {
                hapticTick();
                savePrefs({ partnerAlerts: next });
              }}
            />
          </SettingsGroup>
        ) : null}

        <SettingsGroup title={t('system.alerts.logRow')}>
          <Row
            label={t('system.alerts.logRow')}
            sublabel={t('system.alerts.logRowSub')}
            leading={<IconTile icon="history" color={colors.accent} tint={accentTintOver(colors.fill1, colors.accent)} />}
            chevron
            onPress={() => pushOnce(ALERT_LOG_HREF)}
          />
        </SettingsGroup>

        <Text style={muted}>{t('system.alerts.footerMeta')}</Text>
      </View>

      <AlertKindSheet
        kind={sheetKind}
        setting={sheetSetting}
        suggested={sheetKind === 'large_txn' ? suggested.large : sheetKind === 'low_balance' ? suggested.low : null}
        homeCurrency={homeCurrency}
        formatMoney={formatMoney}
        disabled={sheetKind === 'over_cap' && capsOff}
        onToggle={toggleKind}
        onSave={(kind, patch) => saveKind(kind, patch)}
        onClose={() => setSheetKind(null)}
      />
      <PermissionPreAsk visible={preAsk} busy={asking} onContinue={() => void onContinue()} onNotNow={() => setPreAsk(false)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  back: { marginBottom: space.gapSm },
  column: { gap: space.groupGap, paddingBottom: space.sheetPadBottom },
});
