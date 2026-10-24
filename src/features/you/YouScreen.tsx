// D-13: the You/settings screen — identity, the D-14 accent/font-pairing switchers (wired to
// the live theme, not the persisted profile, so a change is visible before the write
// resolves), the ANL-02 analytics toggle, the D-13/ENV-03 connection indicator, and the D-15
// sign-out row. The destructive colour stays reserved for the confirm-dialog copy only — the
// row label itself is plain ink (00-UI-SPEC.md Color).
import { useCallback, useRef } from 'react';
import { router, useLocalSearchParams, useNavigation, type Href } from 'expo-router';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, View, type HostInstance, type LayoutChangeEvent } from 'react-native';
import { Text } from '@/ui/Text';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { Screen } from '@/ui/Screen';
import { PRESSED_OPACITY, space } from '@/theme/layout';
import { BackButton } from '@/shell/header/BackButton';
import { useBackHistory } from '@/shell/backHistory/BackHistoryProvider';
import { fontSize } from '@/theme/typography';
import { useFab } from '@/shell/fab/FabProvider';
import { focusAccessibility } from '@/shell/a11yFocus';
import { runQuickActionAfterDismiss } from '@/shell/fab/runQuickActionAfterDismiss';
import type { QuickActionId } from '@/shell/fab/quickActions';
import { SyncStatusLine } from '@/ui/SyncStatusLine';
import { EXCHANGE_RATE_API_URL } from '@/i18n/mandatedCopy';
import { useConsent } from '@/features/consent/useConsent';
import { requestSignOut, performSignOut } from '@/features/auth/signOut';
import { useProfile } from './useProfile';
import { SettingsGroup } from './components/SettingsGroup';
import { ACTIVITY_HREF } from '@/features/auth/appHome';
import { AccentSwitcher } from './components/AccentSwitcher';
import { FontPairingSwitcher } from './components/FontPairingSwitcher';
import { AnalyticsToggle } from './components/AnalyticsToggle';
import { WeekStartRow } from './components/WeekStartRow';
import { HomeCurrencyRow } from './components/HomeCurrencyRow';
import { ConnectionStatus } from './components/ConnectionStatus';
import { DevSyncProbe } from './components/DevSyncProbe';

// 02-30: Record entry points (D-32, D-39). Hrefs are cast once because generated route types may
// lag the route files. The statement import lives in the Add group (D-85), not here.
const MONEY_ROWS: readonly {
  label: 'you.record.activity' | 'you.record.accounts' | 'you.record.categories' | 'you.record.history';
  href: Href;
}[] = [
  { label: 'you.record.activity', href: ACTIVITY_HREF },
  { label: 'you.record.accounts', href: '/accounts' as Href },
  { label: 'you.record.categories', href: '/categories' as Href },
  { label: 'you.record.history', href: '/history' as Href },
];

// D-85 / R16.1: the Add group rows, in order. Each runs the FAB quick action with the same id.
const ADD_ROWS: readonly {
  id: QuickActionId;
  label: 'you.add.expense' | 'you.add.income' | 'you.add.transfer' | 'you.add.importStatement' | 'you.add.newCheck';
  hint:
    | 'you.add.expenseHint'
    | 'you.add.incomeHint'
    | 'you.add.transferHint'
    | 'you.add.importStatementHint'
    | 'you.add.newCheckHint';
}[] = [
  { id: 'addExpense', label: 'you.add.expense', hint: 'you.add.expenseHint' },
  { id: 'addIncome', label: 'you.add.income', hint: 'you.add.incomeHint' },
  { id: 'transfer', label: 'you.add.transfer', hint: 'you.add.transferHint' },
  { id: 'importStatement', label: 'you.add.importStatement', hint: 'you.add.importStatementHint' },
  { id: 'newCheck', label: 'you.add.newCheck', hint: 'you.add.newCheckHint' },
];

export function YouScreen() {
  const t = useT();
  const theme = useTheme();
  const { colors, fonts } = theme;
  const { profile, setAccent, setPairing } = useProfile();
  const { consent, setEnabled } = useConsent();
  const { goBack, history } = useBackHistory();
  const { quickActions } = useFab();
  const navigation = useNavigation();

  // 05-116 (D-96): "Exchange rates" in the Needs a look sheet opens You with ?focus=currencies. From the row's layout
  // event (once), scroll the row into view and move screen-reader focus to it.
  const { focus } = useLocalSearchParams<{ focus?: string }>();
  const scrollRef = useRef<ScrollView>(null);
  const currencyRowRef = useRef<View>(null);
  const focusedCurrencies = useRef(false);
  const onCurrencyRowLayout = (_event: LayoutChangeEvent): void => {
    if (focus !== 'currencies' || focusedCurrencies.current) return;
    focusedCurrencies.current = true;
    const row = currencyRowRef.current;
    const scroll = scrollRef.current;
    // getInnerViewRef is on the runtime ScrollView but missing from the shipped typings.
    const inner = (scroll as unknown as { getInnerViewRef?: () => unknown } | null)?.getInnerViewRef?.();
    if (row !== null && inner != null) {
      row.measureLayout(inner as never, (_x, y) => scroll?.scrollTo({ y: Math.max(0, y - space.groupGap), animated: true }), () => undefined);
    }
    focusAccessibility(row as HostInstance | null);
  };

  // D-85: the tab root You was opened from (the last tab in the back history), else Activity.
  const originHref = (() => {
    for (let i = history.length - 1; i >= 0; i--) {
      const entry = history[i];
      if (entry && entry.area === 'tab') return entry.href as Href;
    }
    return ACTIVITY_HREF;
  })();
  const handlers: Partial<Record<QuickActionId, () => void>> = {};
  for (const q of quickActions) handlers[q.id] = q.run;
  const addRows = ADD_ROWS.filter((row) => handlers[row.id] !== undefined);

  const runAdd = (id: QuickActionId): void => {
    runQuickActionAfterDismiss(id, {
      handlers,
      dismissTo: () => router.dismissTo(originHref),
      onTransitionEnd: (listener) =>
        navigation.addListener('transitionEnd' as never, ((e: { data?: { closing?: boolean } }) => {
          if (e.data?.closing) listener();
        }) as never),
    });
  };

  // D-13: full_name, falling back to email when the name hasn't been captured; the email
  // itself is always also shown as the sub-label.
  const displayName = profile?.full_name ?? profile?.email ?? '';
  const initial = displayName.charAt(0).toUpperCase();

  const handleSignOut = useCallback(async () => {
    const result = await requestSignOut({ resetTheme: theme.reset });
    if (!result.needsConfirm) return;

    Alert.alert('', t('signOut.confirm.body', { count: result.count ?? 0 }), [
      { text: t('signOut.confirm.cancel'), style: 'cancel' },
      {
        text: t('signOut.confirm.proceed'),
        style: 'destructive',
        onPress: () => {
          void performSignOut({ resetTheme: theme.reset });
        },
      },
    ]);
  }, [t, theme]);

  return (
    <Screen scroll scrollRef={scrollRef}>
      <View style={styles.back}>
        <BackButton variant="compact" onPress={goBack} />
      </View>
      <Text style={[styles.title, { fontFamily: fonts.body[700], color: colors.ink }]}>{t('you.title')}</Text>

      <View style={styles.identity}>
        <View style={[styles.avatar, { backgroundColor: colors.fill1 }]}>
          <Text style={[styles.avatarLabel, { fontFamily: fonts.body[500], color: colors.ink }]}>{initial}</Text>
        </View>
        <View style={styles.identityText}>
          <Text style={[styles.name, { fontFamily: fonts.body[500], color: colors.ink }]}>{displayName}</Text>
          {profile?.email ? (
            <Text style={[styles.email, { fontFamily: fonts.body[500], color: colors.inkMuted }]}>
              {profile.email}
            </Text>
          ) : null}
        </View>
      </View>

      {addRows.length > 0 ? (
        <SettingsGroup title={t('you.add.section')}>
          {addRows.map((row) => (
            <Pressable
              key={row.id}
              accessibilityRole="button"
              accessibilityHint={t(row.hint)}
              onPress={() => runAdd(row.id)}
              style={({ pressed }) => [styles.moneyRow, pressed && { opacity: PRESSED_OPACITY }]}
            >
              <Text style={[styles.rowLabel, { fontFamily: fonts.body[500], color: colors.ink }]}>{t(row.label)}</Text>
            </Pressable>
          ))}
        </SettingsGroup>
      ) : null}

      <SettingsGroup title={t('you.record.section')}>
        {MONEY_ROWS.map((row) => (
          <Pressable key={row.label} accessibilityRole="button" onPress={() => (row.href === ACTIVITY_HREF ? router.dismissTo(ACTIVITY_HREF) : router.push(row.href))} style={styles.moneyRow}>
            <Text style={[styles.rowLabel, { fontFamily: fonts.body[500], color: colors.ink }]}>{t(row.label)}</Text>
          </Pressable>
        ))}
        <WeekStartRow />
        <HomeCurrencyRow rowRef={currencyRowRef} onRowLayout={onCurrencyRowLayout} />
      </SettingsGroup>

      <SettingsGroup title={t('you.section.appearance')}>
        <View>
          <Text style={[styles.rowLabel, { fontFamily: fonts.body[500], color: colors.ink }]}>
            {t('you.accent.label')}
          </Text>
          <View style={styles.rowContent}>
            <AccentSwitcher value={theme.accent} onChange={setAccent} />
          </View>
        </View>
        <View>
          <Text style={[styles.rowLabel, { fontFamily: fonts.body[500], color: colors.ink }]}>
            {t('you.font.label')}
          </Text>
          <View style={styles.rowContent}>
            <FontPairingSwitcher value={theme.pairing} onChange={setPairing} />
          </View>
        </View>
      </SettingsGroup>

      <SettingsGroup title={t('you.section.privacy')}>
        <View style={styles.privacyRow}>
          <View style={styles.privacyText}>
            <Text style={[styles.rowLabel, { fontFamily: fonts.body[500], color: colors.ink }]}>
              {t('you.analytics.label')}
            </Text>
            <Text style={[styles.hint, { fontFamily: fonts.body[500], color: colors.inkMuted }]}>
              {t('you.analytics.hint')}
            </Text>
          </View>
          <AnalyticsToggle
            value={consent === 'granted'}
            onChange={(next) => {
              void setEnabled(next);
            }}
            accessibilityLabel={t('you.analytics.label')}
          />
        </View>
      </SettingsGroup>

      <SettingsGroup title={t('you.section.connection')}>
        <ConnectionStatus />
        <SyncStatusLine detail />
      </SettingsGroup>

      <SettingsGroup title={t('you.section.account')}>
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            void handleSignOut();
          }}
        >
          <Text style={[styles.rowLabel, { fontFamily: fonts.body[500], color: colors.ink }]}>
            {t('you.signOut')}
          </Text>
        </Pressable>
        {__DEV__ ? <DevSyncProbe /> : null}
      </SettingsGroup>

      <Pressable
        accessibilityRole="link"
        onPress={() => {
          Linking.openURL(EXCHANGE_RATE_API_URL).catch(() => undefined);
        }}
        style={styles.credits}
      >
        <Text style={[styles.creditsText, { fontFamily: fonts.body[500], color: colors.inkFaint }]}>
          {t('credits.exchangeRateApi')}
        </Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  back: { marginBottom: space.gapMd },
  title: {
    fontSize: fontSize.heading,
    lineHeight: fontSize.heading * 1.16,
    letterSpacing: fontSize.heading * -0.01,
  },
  identity: {
    marginTop: space.groupGap,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.gapMd,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLabel: {
    fontSize: fontSize.body,
  },
  identityText: {
    flexShrink: 1,
  },
  name: {
    fontSize: fontSize.body,
  },
  email: {
    marginTop: 2,
    fontSize: fontSize.label,
  },
  rowLabel: {
    fontSize: fontSize.body,
  },
  // S-WR-14: a full-size touch target for each Money row.
  moneyRow: {
    minHeight: space.touchMin,
    justifyContent: 'center',
  },
  rowContent: {
    marginTop: space.gapSm,
  },
  privacyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.gapMd,
  },
  privacyText: {
    flexShrink: 1,
  },
  hint: {
    marginTop: 2,
    fontSize: fontSize.label,
  },
  credits: {
    marginTop: space.groupGap,
    alignSelf: 'center',
  },
  creditsText: {
    fontSize: fontSize.meta,
    textDecorationLine: 'underline',
  },
});
