// D-13: the You/settings screen — identity, the D-14 accent/font-pairing switchers (wired to
// the live theme, not the persisted profile, so a change is visible before the write
// resolves), the ANL-02 analytics toggle, the D-13/ENV-03 connection indicator, and the D-15
// sign-out row. The destructive colour stays reserved for the confirm-dialog copy only — the
// row label itself is plain ink (00-UI-SPEC.md Color).
// 06.2-15 (L04, D-06, D-21): groups Add, Money, Appearance, Alerts and feel, Privacy and data, Account. Every row has
// one 36 accent tile (YOU_ROW_ICON) and its word, and shows its current setting where it has one. Only rows whose
// feature exists are shown (no Face ID, PIN lock, Alerts or Delete account row yet).
import { useCallback, useRef, type ReactNode, type RefObject } from 'react';
import { router, useLocalSearchParams, useNavigation, type Href } from 'expo-router';
import { pushOnce } from '@/shell/navigation/pushOnce';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, View, type HostInstance, type LayoutChangeEvent } from 'react-native';
import { Text } from '@/ui/Text';
import { Glyph } from '@/ui/icons/Glyph';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { Screen } from '@/ui/Screen';
import { iconSize, PRESSED_OPACITY, rowHeight, space, step, tile } from '@/theme/layout';
import { BackButton } from '@/shell/header/BackButton';
import { useBackHistory } from '@/shell/backHistory/BackHistoryProvider';
import { fontSize, textRole } from '@/theme/typography';
import { Row } from '@/ui/Row';
import { ToggleRow } from '@/ui/ToggleRow';
import { IconTile } from '@/ui/icons/IconTile';
import { accentTintOver } from '@/ui/EmptyState';
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
import { WeekStartRow } from './components/WeekStartRow';
import { HomeCurrencyRow } from './components/HomeCurrencyRow';
import { RegionRow } from './components/RegionRow';
import { ConnectionStatus } from './components/ConnectionStatus';
import { DevSyncProbe } from './components/DevSyncProbe';
import { HapticsRow } from './components/HapticsRow';
import { YOU_ROW_ICON, type YouRowId } from './components/youRowIcons';

// Owner 2026-11-11: the old Pots screen is gone; the row opens the Grow goals segment.
const GOALS_HREF = '/grow?segment=goals' as Href;

// 02-30: Record entry points (D-32, D-39). Hrefs are cast once because generated route types may
// lag the route files. The statement import lives in the Add group (D-85), not here.
const MONEY_ROWS: readonly {
  id: YouRowId;
  label: 'you.record.activity' | 'you.record.accounts' | 'you.record.categories' | 'you.record.history' | 'grow.home.segments.goals';
  href: Href;
}[] = [
  { id: 'activity', label: 'you.record.activity', href: ACTIVITY_HREF },
  { id: 'accounts', label: 'you.record.accounts', href: '/accounts' as Href },
  { id: 'categories', label: 'you.record.categories', href: '/categories' as Href },
  { id: 'history', label: 'you.record.history', href: '/history' as Href },
  { id: 'goals', label: 'grow.home.segments.goals', href: GOALS_HREF },
];

// D-85 / R16.1: the Add group rows, in order. Each runs the FAB quick action with the same id.
const ADD_ROWS: readonly {
  id: QuickActionId;
  icon: YouRowId;
  label: 'you.add.expense' | 'you.add.income' | 'you.add.transfer' | 'you.add.importStatement' | 'you.add.newCheck';
  hint:
    | 'you.add.expenseHint'
    | 'you.add.incomeHint'
    | 'you.add.transferHint'
    | 'you.add.importStatementHint'
    | 'you.add.newCheckHint';
}[] = [
  { id: 'addExpense', icon: 'expense', label: 'you.add.expense', hint: 'you.add.expenseHint' },
  { id: 'addIncome', icon: 'income', label: 'you.add.income', hint: 'you.add.incomeHint' },
  { id: 'transfer', icon: 'transfer', label: 'you.add.transfer', hint: 'you.add.transferHint' },
  { id: 'importStatement', icon: 'importStatement', label: 'you.add.importStatement', hint: 'you.add.importStatementHint' },
  { id: 'newCheck', icon: 'newCheck', label: 'you.add.newCheck', hint: 'you.add.newCheckHint' },
];

export function YouScreen() {
  const t = useT();
  const theme = useTheme();
  const { colors, fonts, pairing } = theme;
  const tint = accentTintOver(colors.fill1, colors.accent);
  // One 36 accent tile per row (D-06), decorative beside its word.
  const tileFor = (id: YouRowId): ReactNode => (
    <IconTile icon={YOU_ROW_ICON[id]} color={colors.accent} tint={tint} testID={`you-tile-${id}`} />
  );
  // A row whose body is its own component (pickers, switches): the tile beside it, lined up with its first line.
  const tiled = (id: YouRowId, body: ReactNode): ReactNode => (
    <View style={styles.tiled}>
      <View style={styles.tiledTile}>{tileFor(id)}</View>
      <View style={styles.tiledBody}>{body}</View>
    </View>
  );
  const { profile, setAccent, setPairing } = useProfile();
  const { consent, setEnabled } = useConsent();
  const { goBack, history } = useBackHistory();
  const { quickActions } = useFab();
  const navigation = useNavigation();

  // 05-116 (D-96): "Exchange rates" in the Needs a look sheet opens You with ?focus=currencies. From the row's layout
  // event (once), scroll the row into view and move screen-reader focus to it.
  // 06.1-71 (CN-10, OQ-71-1 B): Decide's "Set your region" opens You with ?focus=region, the same way, on the Region row.
  const { focus } = useLocalSearchParams<{ focus?: string }>();
  const scrollRef = useRef<ScrollView>(null);
  const currencyRowRef = useRef<View>(null);
  const regionRowRef = useRef<View>(null);
  const focusedRow = useRef(false);
  const focusRowOnLayout = (target: 'currencies' | 'region', rowRef: RefObject<View | null>): void => {
    if (focus !== target || focusedRow.current) return;
    focusedRow.current = true;
    const row = rowRef.current;
    const scroll = scrollRef.current;
    // getInnerViewRef is on the runtime ScrollView but missing from the shipped typings.
    const inner = (scroll as unknown as { getInnerViewRef?: () => unknown } | null)?.getInnerViewRef?.();
    if (row !== null && inner != null) {
      row.measureLayout(inner as never, (_x, y) => scroll?.scrollTo({ y: Math.max(0, y - space.groupGap), animated: true }), () => undefined);
    }
    focusAccessibility(row as HostInstance | null);
  };
  const onCurrencyRowLayout = (_event: LayoutChangeEvent): void => focusRowOnLayout('currencies', currencyRowRef);
  const onRegionRowLayout = (_event: LayoutChangeEvent): void => focusRowOnLayout('region', regionRowRef);

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
              style={({ pressed }) => [styles.moneyRow, styles.addRow, pressed && { opacity: PRESSED_OPACITY }]}
            >
              {tileFor(row.icon)}
              <Text style={[styles.addLabel, { ...textRole(pairing, 'body'), color: colors.ink }]}>{t(row.label)}</Text>
              <Glyph name="arrowRight" size={iconSize.inline} color={colors.inkFaint} />
            </Pressable>
          ))}
        </SettingsGroup>
      ) : null}

      <SettingsGroup title={t('appLife.you.groups.money')}>
        {MONEY_ROWS.map((row) => (
          <Row
            key={row.id}
            label={t(row.label)}
            leading={tileFor(row.id)}
            chevron
            onPress={() => (row.href === ACTIVITY_HREF ? router.dismissTo(ACTIVITY_HREF) : pushOnce(row.href))}
          />
        ))}
        {tiled('weekStart', <WeekStartRow />)}
        {tiled('homeCurrency', <HomeCurrencyRow rowRef={currencyRowRef} onRowLayout={onCurrencyRowLayout} />)}
        {tiled('region', <RegionRow rowRef={regionRowRef} onRowLayout={onRegionRowLayout} />)}
      </SettingsGroup>

      <SettingsGroup title={t('appLife.you.groups.appearance')}>
        <View>
          <Row label={t('you.accent.label')} value={t(`you.accent.${theme.accent}`)} leading={tileFor('accent')} />
          <View style={styles.rowContent}>
            <AccentSwitcher value={theme.accent} onChange={setAccent} />
          </View>
        </View>
        <View>
          <Row label={t('you.font.label')} value={t(`you.font.${theme.pairing}`)} leading={tileFor('font')} />
          <View style={styles.rowContent}>
            <FontPairingSwitcher value={theme.pairing} onChange={setPairing} />
          </View>
        </View>
      </SettingsGroup>

      <SettingsGroup title={t('appLife.you.groups.alertsFeel')}>
        <HapticsRow />
      </SettingsGroup>

      <SettingsGroup title={t('appLife.you.groups.privacyData')}>
        {tiled(
          'analytics',
          // 06.2-15: the shared ToggleRow (as Haptics), so the whole row is the 44+ switch target. Same consent wiring.
          <ToggleRow
            label={t('you.analytics.label')}
            sub={t('you.analytics.hint')}
            value={consent === 'granted'}
            onChange={(next) => {
              void setEnabled(next);
            }}
          />
        )}
        {tiled(
          'connection',
          <View style={styles.connection}>
            <ConnectionStatus />
            <SyncStatusLine detail />
          </View>
        )}
      </SettingsGroup>

      <SettingsGroup title={t('appLife.you.groups.account')}>
        <Row
          label={t('you.signOut')}
          leading={tileFor('signOut')}
          chevron
          onPress={() => {
            void handleSignOut();
          }}
        />
        {__DEV__ ? <DevSyncProbe /> : null}
      </SettingsGroup>

      <Pressable
        accessibilityRole="link"
        onPress={() => {
          Linking.openURL(EXCHANGE_RATE_API_URL).catch(() => undefined);
        }}
        style={styles.credits}
      >
        <Text style={[styles.creditsText, { fontFamily: fonts.body[500], color: colors.inkMuted }]}>
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
  // S-WR-14: a full-size touch target for each Add row (06.2 D-09: 52, the one-line row height).
  moneyRow: {
    minHeight: rowHeight.one,
    justifyContent: 'center',
  },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: step.row,
  },
  addLabel: { flex: 1 },
  tiled: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: step.row,
  },
  // Centres the 36 tile on the row's first 44-tall line.
  tiledTile: {
    width: tile.row,
    marginTop: (space.touchMin - tile.row) / 2,
  },
  tiledBody: { flex: 1, minHeight: space.touchMin, justifyContent: 'center' },
  connection: { paddingVertical: step.tight, gap: step.hair },
  rowContent: {
    marginTop: space.gapSm,
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
