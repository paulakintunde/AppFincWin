/**
 * Plan 05.2-35 (D-18, D-19): the Decide tab for test accounts. In place of "Coming soon" it shows the setup status card, a
 * card of three rows (Decide settings, Unspent money, Emergency fund) and the engine readout, so the owner can check on the
 * phone that every answer lands in the engine. 05.3 replaces this page.
 *
 * Reads only. Loading draws skeleton bars; a failed read with nothing cached draws the shipped "Your figures didn't load"
 * state with Try again; offline shows the cached figures (useDecideV3 keeps them) with the header sync line.
 */
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { Href } from 'expo-router';
import { Text } from '@/ui/Text';
import { Pill } from '@/ui/Pill';
import { useMoneyFormatter } from '@/ui/money/useMoneyFormatter';
import { useAccounts } from '@/data/queries/accounts';
import { useDecideV3 } from '@/data/queries/decideV3';
import { useRecordContext } from '@/features/record/useRecordContext';
import { Meta, useNoWrapMoney } from '@/features/income/steps/shared';
import { useT } from '@/i18n';
import { TabRootScreen } from '@/shell/screen/TabRootScreen';
import { pushOnce } from '@/shell/navigation/pushOnce';
import { PRESSED_OPACITY, radii, space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { textRole } from '@/theme/typography';
import { StateChip, type StateChipTone } from '../ui/StateChip';
import { EmergencyFundSheet } from './EmergencyFundSheet';
import { EngineReadoutCard } from './EngineReadoutCard';
import { readoutRows, type ReadoutFormat } from './readoutModel';
import { firstUnansweredNeeded, remainingNeeded, setupStatus } from './setupFlow';
import { SetupStatusCard } from './SetupStatusCard';
import { UnspentSheet } from './UnspentSheet';
import { useSetupFacts } from './useSetupFacts';
import { useUnspent } from './useUnspent';
import type { UnspentView } from './unspentView';

type Translate = (key: string, options?: Record<string, unknown>) => string;

const SETUP_HREF = '/decide/setup' as Href;
const SETTINGS_HREF = '/decide/settings' as Href;
const startAtHref = (step: string): Href => `/decide/setup?startAt=${step}` as Href;
const ONLY_ACCOUNT_USE = '/decide/setup?only=accountUse' as Href;
const K = 'decide.setupPage.';

interface UnspentDisplay {
  figure: number | null;
  chip: { tone: StateChipTone; text: string };
}

function unspentDisplay(view: UnspentView | null, t: Translate, date: (iso: string) => string): UnspentDisplay | null {
  if (view === null) return null;
  switch (view.kind) {
    case 'notConfirmed':
      return { figure: null, chip: { tone: 'draft', text: t(`${K}chipNotConfirmed`) } };
    case 'fresh':
      return { figure: view.value, chip: { tone: 'fits', text: t(`${K}chipConfirmed`, { date: date(view.anchorAt) }) } };
    case 'drifted':
      return { figure: view.rolled, chip: { tone: 'adjust', text: t(`${K}chipDiffers`) } };
    case 'stale':
      return { figure: view.value, chip: { tone: 'adjust', text: t(`${K}chipStale`, { n: view.days }) } };
  }
}

function PageRow(props: { label: string; value?: string | null; chip?: { tone: StateChipTone; text: string } | null; onPress: () => void; last?: boolean }) {
  const { colors, pairing } = useTheme();
  const { label, value = null, chip = null, onPress, last = false } = props;
  const spoken = [label, value, chip?.text].filter((x): x is string => x !== null && x !== undefined).join(', ');
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={spoken}
      onPress={onPress}
      style={({ pressed }) => [styles.row, { opacity: pressed ? PRESSED_OPACITY : 1, borderBottomColor: colors.line1, borderBottomWidth: last ? 0 : 1 }]}
    >
      <View style={styles.rowText}>
        <Text style={{ ...textRole(pairing, 'sheetTitle'), color: colors.ink }}>{label}</Text>
        {value !== null ? <Text style={{ ...textRole(pairing, 'body'), color: colors.inkDim }}>{value}</Text> : null}
        {chip !== null ? <StateChip tone={chip.tone} label={chip.text} /> : null}
      </View>
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.chevron, { borderColor: colors.inkFaint }]} />
    </Pressable>
  );
}

function Skeleton(): React.JSX.Element {
  const { colors } = useTheme();
  const t = useT();
  const bar = (height: number, key: string) => <View key={key} style={[styles.bar, { height, backgroundColor: colors.fill1 }]} />;
  return (
    <View accessibilityState={{ busy: true }} accessibilityLabel={t('decide.setupPage.loadingA11y')} style={styles.body}>
      {bar(150, 'status')}
      {bar(190, 'rows')}
      {bar(260, 'readout')}
    </View>
  );
}

export function DecideSetupPage(): React.JSX.Element {
  const t = useT() as unknown as Translate;
  const { colors, pairing } = useTheme();
  const rc = useRecordContext();
  const v3 = useDecideV3();
  const facts = useSetupFacts();
  const unspent = useUnspent();
  const accounts = useAccounts(rc.householdId ?? undefined).data;
  const [unspentOpen, setUnspentOpen] = useState(false);
  const [emergencyOpen, setEmergencyOpen] = useState(false);

  const currency = v3.inputs?.currency ?? rc.homeCurrency;
  const formatter = useMoneyFormatter(false, currency);
  const noWrap = useNoWrapMoney(currency);
  const date = (iso: string) => formatter.formatDate(iso);
  const money = (minor: number) => noWrap(minor);

  const { inputs, evaluation } = v3;
  const rows = useMemo(() => {
    if (inputs === null || evaluation === null) return [];
    const accountNames = Object.fromEntries((accounts ?? []).map((a) => [a.id, a.name]));
    const fmt: ReadoutFormat = {
      money: (minor) => noWrap(minor),
      date: (iso) => formatter.formatDate(iso),
      word: (key, params) => t(key, params),
    };
    return readoutRows(inputs, evaluation, { accountNames }, fmt).map((r) => ({ id: r.id, label: t(r.labelKey), value: r.value }));
    // the formatters are stable per currency and locale; t per language.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputs, evaluation, accounts, currency, t]);

  const header = { title: t(`${K}title`), eyebrow: t(`${K}eyebrow`) };

  if (v3.status === 'error') {
    return (
      <TabRootScreen {...header}>
        <View style={styles.body}>
          <View accessibilityRole="alert" style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line2 }]}>
            <Text accessibilityRole="header" style={{ ...textRole(pairing, 'sheetTitle'), color: colors.ink }}>
              {t('decide.quick.error.heading')}
            </Text>
            <View style={styles.action}>
              <Pill label={t('decide.quick.error.retry')} variant="secondary" onPress={v3.refetch} />
            </View>
          </View>
        </View>
      </TabRootScreen>
    );
  }

  if (v3.status === 'loading' || facts === null || inputs === null) {
    return (
      <TabRootScreen {...header}>
        <Skeleton />
      </TabRootScreen>
    );
  }

  const status = setupStatus(facts);
  const remaining = remainingNeeded(facts);
  const first = firstUnansweredNeeded(facts);
  const display = unspentDisplay(unspent.view, t, date);
  const emergencyAmount = inputs.emergency?.amount;

  return (
    <TabRootScreen
      {...header}
      overlay={
        <>
          <UnspentSheet
            visible={unspentOpen}
            onClose={() => setUnspentOpen(false)}
            onSetThem={() => {
              setUnspentOpen(false);
              pushOnce(ONLY_ACCOUNT_USE);
            }}
          />
          <EmergencyFundSheet visible={emergencyOpen} onClose={() => setEmergencyOpen(false)} />
        </>
      }
    >
      <View style={styles.body}>
        <SetupStatusCard
          status={status}
          remaining={remaining}
          onStart={() => pushOnce(SETUP_HREF)}
          onFinish={first === null ? null : () => pushOnce(startAtHref(first))}
          onChange={() => pushOnce(SETTINGS_HREF)}
        />
        <View style={[styles.card, styles.rowsCard, { backgroundColor: colors.surface, borderColor: colors.line2 }]}>
          <PageRow label={t(`${K}rowSettings`)} onPress={() => pushOnce(SETTINGS_HREF)} />
          <PageRow
            label={t(`${K}rowUnspent`)}
            value={display?.figure != null ? money(display.figure) : null}
            chip={display?.chip ?? null}
            onPress={() => setUnspentOpen(true)}
          />
          <PageRow
            label={t(`${K}rowEmergency`)}
            value={emergencyAmount !== undefined ? money(Number(emergencyAmount)) : t(`${K}emergencyNotSet`)}
            onPress={() => setEmergencyOpen(true)}
            last
          />
        </View>
        <EngineReadoutCard rows={rows} />
        <Meta text={t(`${K}footer`)} />
      </View>
    </TabRootScreen>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: space.screenH, paddingTop: space.groupGap, gap: space.groupGap },
  card: { borderRadius: radii.card, borderWidth: 1, padding: space.cardPadLg, gap: space.gapMd },
  rowsCard: { paddingVertical: 0, paddingHorizontal: space.cardPad, gap: 0 },
  row: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: space.gapMd, paddingVertical: space.rowPad },
  rowText: { flex: 1, gap: 4 },
  chevron: { width: 8, height: 8, borderTopWidth: 2, borderRightWidth: 2, transform: [{ rotate: '45deg' }] },
  action: { alignSelf: 'flex-start', maxWidth: '100%' },
  bar: { borderRadius: radii.card },
});
