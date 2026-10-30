/**
 * 05.3-39 (DSV-02, DSV-03, D-06, D-20): the v3 Decide home, assembled from the built cards and lists.
 * Order: setup status (only while setup is unfinished), month card, check card or the not-ready card in its slot, refine
 * card (05.3-53: after the main card), envelopes, saved plans, unfinished checks, "Something changed?", Past decisions row,
 * footer. Every number comes from useChecksV3, so the rows here and the answer screen show one code per check.
 */
import React, { useCallback, useMemo } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, View } from 'react-native';
import type { Href } from 'expo-router';
import { useChecksV3 } from '@/data/queries/decideCheckV3';
import type { DecideCheckRow } from '@/db/decideChecks';
import { useT } from '@/i18n';
import { TabRootScreen } from '@/shell/screen/TabRootScreen';
import { AvatarButton } from '@/shell/header/AvatarButton';
import { pushOnce } from '@/shell/navigation/pushOnce';
import { PRESSED_OPACITY, radii, space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { fontSize, textRole } from '@/theme/typography';
import { Pill } from '@/ui/Pill';
import { Text } from '@/ui/Text';
import { usePotsRead } from '../../pots/usePots';
import { firstUnansweredNeeded, remainingNeeded, setupStatus } from '../../setup/setupFlow';
import { SetupStatusCard } from '../../setup/SetupStatusCard';
import { useSetupFacts } from '../../setup/useSetupFacts';
import { useUnspent } from '../../setup/useUnspent';
import { notReadyRows } from '../model/notReady';
import { DECISIONS_HREF } from '../nav/hrefs';
import { SavedPlanRow } from '../lists/SavedPlanRow';
import { NotReadyCard } from '../ready/NotReadyCard';
import { RefineCard } from '../refine/RefineCard';
import { CheckCard } from './CheckCard';
import { EnvelopeGrid, type EnvelopeTile } from './EnvelopeGrid';
import { MonthBarCard } from './MonthBarCard';
import { SomethingChangedRow } from './SomethingChangedRow';

type Translate = (key: string, options?: Record<string, unknown>) => string;

const SETTINGS_HREF = '/decide/settings' as Href;
const SETUP_HREF = '/decide/setup' as Href;
const startAtHref = (step: string): Href => `/decide/setup?startAt=${step}` as Href;
const K = 'decide.v3.ui.home.';
const BUTTON = 44;
const DOT = 4;
const ROW_RADIUS = 16;
const ROW_MIN = 44;
const PAD_V = 10;
const PAD_H = 16;
const CHEVRON = 8;
const SKELETON_TALL = 190;
const SKELETON_MID = 120;

function hasPrice(live: { purchase?: { whole?: unknown } | null } | undefined): boolean {
  const whole = live?.purchase?.whole;
  return whole !== undefined && whole !== null && Number(whole) > 0;
}

function SettingsButton(): React.JSX.Element {
  const t = useT() as unknown as Translate;
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t(`${K}settings`)}
      onPress={() => pushOnce(SETTINGS_HREF)}
      style={({ pressed }) => [styles.settings, { opacity: pressed ? PRESSED_OPACITY : 1 }]}
    >
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.dots}>
        <View style={[styles.dot, { backgroundColor: colors.ink }]} />
        <View style={[styles.dot, { backgroundColor: colors.ink }]} />
        <View style={[styles.dot, { backgroundColor: colors.ink }]} />
      </View>
    </Pressable>
  );
}

function Skeleton(): React.JSX.Element {
  const { colors } = useTheme();
  const t = useT() as unknown as Translate;
  return (
    <View accessibilityState={{ busy: true }} accessibilityLabel={t('decide.setupPage.loadingA11y')} style={styles.body}>
      <View style={[styles.bar, { height: SKELETON_TALL, backgroundColor: colors.fill1 }]} />
      <View style={[styles.bar, { height: SKELETON_MID, backgroundColor: colors.fill1 }]} />
      <View style={[styles.bar, { height: SKELETON_MID, backgroundColor: colors.fill1 }]} />
    </View>
  );
}

export function HomeScreen(): React.JSX.Element {
  const t = useT() as unknown as Translate;
  const { colors, pairing } = useTheme();
  const { status, rows, home, byId, withoutRefunds, refetch } = useChecksV3();
  const facts = useSetupFacts();
  const unspent = useUnspent();
  const pots = usePotsRead();

  const header = {
    title: t('decide.setupPage.title'),
    eyebrow: t('decide.setupPage.eyebrow'),
    trailing: <SettingsButton />,
    compactTrailing: (
      <>
        <SettingsButton />
        <AvatarButton />
      </>
    ),
  };

  const announceReady = useCallback(() => {
    AccessibilityInfo.announceForAccessibility(t(`${K}readyNow`));
  }, [t]);

  const envelopes = useMemo<EnvelopeTile[]>(
    () => pots.model.live.filter((p) => p.kind === 'pot').map((p) => ({ id: p.row.id, name: p.row.name, amount: p.saved ?? 0 })),
    [pots.model.live],
  );

  const saved = useMemo(() => rows.filter((r: DecideCheckRow) => r.status === 'waiting'), [rows]);
  const unfinished = useMemo(
    () => rows.filter((r: DecideCheckRow) => r.status === 'open' && (r.name !== '' || hasPrice(byId.get(r.id)))),
    [rows, byId],
  );
  const pastCount = useMemo(() => rows.filter((r: DecideCheckRow) => r.status === 'bought' || r.status === 'passed').length, [rows]);

  if (status === 'error' && home === null) {
    return (
      <TabRootScreen {...header}>
        <View style={styles.body}>
          <View accessibilityRole="alert" style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line2 }]}>
            <Text accessibilityRole="header" style={{ ...textRole(pairing, 'sheetTitle'), color: colors.ink }}>
              {t('decide.quick.error.heading')}
            </Text>
            <View style={styles.action}>
              <Pill label={t('decide.quick.error.retry')} variant="secondary" onPress={refetch} />
            </View>
          </View>
        </View>
      </TabRootScreen>
    );
  }

  if (status === 'loading' || home === null) {
    return (
      <TabRootScreen {...header}>
        <Skeleton />
      </TabRootScreen>
    );
  }

  const setup = facts === null ? 'done' : setupStatus(facts);
  const remaining = facts === null ? [] : remainingNeeded(facts);
  const showSetup = facts !== null && (setup === 'not_started' || remaining.length > 0);
  const first = facts === null ? null : firstUnansweredNeeded(facts);
  const readiness = home.result.readiness;
  const thisMonth = home.month.month;
  const ready = notReadyRows(readiness, thisMonth).length === 0;
  const staleDays = unspent.view?.kind === 'stale' ? unspent.view.days : undefined;
  const heading = (key: string): React.JSX.Element => (
    <Text accessibilityRole="header" style={{ ...textRole(pairing, 'sheetTitle'), color: colors.inkDim }}>
      {t(key)}
    </Text>
  );

  return (
    <TabRootScreen {...header}>
      <View style={styles.body}>
        {showSetup ? (
          <SetupStatusCard
            status={setup}
            remaining={remaining}
            onStart={() => pushOnce(SETUP_HREF)}
            onFinish={first === null ? null : () => pushOnce(startAtHref(first))}
            onChange={() => pushOnce(SETTINGS_HREF)}
          />
        ) : null}
        <MonthBarCard evaluation={home} unspentStaleDays={staleDays} />
        {ready ? <CheckCard /> : null}
        <NotReadyCard readiness={readiness} thisMonth={thisMonth} onReady={announceReady} />
        {/* 05.3-53 (F9): the nudge follows the main card so it never pushes that card below the fold. */}
        <RefineCard />
        <EnvelopeGrid envelopes={envelopes} />
        {saved.length > 0 ? (
          <View style={styles.section}>
            {heading(`${K}savedPlans`)}
            {saved.map((r) => (
              <SavedPlanRow key={r.id} row={r} live={byId.get(r.id)} without={withoutRefunds.get(r.id)} />
            ))}
          </View>
        ) : null}
        {unfinished.length > 0 ? (
          <View style={styles.section}>
            {heading(`${K}unfinished`)}
            {unfinished.map((r) => (
              <SavedPlanRow key={r.id} row={r} live={byId.get(r.id)} without={undefined} />
            ))}
          </View>
        ) : null}
        <SomethingChangedRow />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${t(`${K}pastTitle`)}, ${pastCount === 0 ? t(`${K}pastNone`) : t(`${K}pastCount`, { count: pastCount })}`}
          onPress={() => pushOnce(DECISIONS_HREF)}
          style={({ pressed }) => [styles.past, { backgroundColor: colors.surface, borderColor: colors.line2, opacity: pressed ? PRESSED_OPACITY : 1 }]}
        >
          <View style={styles.pastText}>
            <Text style={{ ...textRole(pairing, 'body'), color: colors.ink }}>{t(`${K}pastTitle`)}</Text>
            <Text style={{ ...textRole(pairing, 'body'), fontSize: fontSize.meta, color: colors.inkDim }}>
              {pastCount === 0 ? t(`${K}pastNone`) : t(`${K}pastCount`, { count: pastCount })}
            </Text>
          </View>
          <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.chevron, { borderColor: colors.inkMuted }]} />
        </Pressable>
        <Text style={{ ...textRole(pairing, 'body'), fontSize: fontSize.meta, color: colors.inkMuted }}>{t('legal.decideFooter')}</Text>
      </View>
    </TabRootScreen>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: space.screenH, paddingTop: space.groupGap, gap: space.groupGap },
  section: { gap: space.gapMd },
  card: { borderRadius: radii.card, borderWidth: 1, padding: space.cardPadLg, gap: space.gapMd },
  action: { alignSelf: 'flex-start', maxWidth: '100%' },
  bar: { borderRadius: radii.card },
  settings: { minWidth: BUTTON, minHeight: BUTTON, alignItems: 'center', justifyContent: 'center' },
  dots: { flexDirection: 'row', gap: DOT },
  dot: { width: DOT, height: DOT, borderRadius: DOT / 2 },
  past: {
    minHeight: ROW_MIN,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.gapMd,
    borderRadius: ROW_RADIUS,
    borderWidth: 1,
    paddingVertical: PAD_V,
    paddingHorizontal: PAD_H,
  },
  pastText: { flex: 1, gap: 2 },
  chevron: { width: CHEVRON, height: CHEVRON, borderTopWidth: 2, borderRightWidth: 2, transform: [{ rotate: '45deg' }] },
});
