// 06-18 (G09, GRW-05, GRW-06, GRW-10, D-12, D-24): one holding. The value with its as-of date, the gain or loss as a record (not
// a tax figure), the value history, the buy / sale / dividend / fee entries, Update value and Remove. Declarative copy only.
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { useEditHolding } from '@/data/mutations/growHoldings';
import { useAccounts } from '@/data/queries/accounts';
import { useAccountBalances } from '@/data/queries/activity';
import { convertLatest } from '@/data/queries/fxConvert';
import { useHoldingLotRows, useHoldingRows } from '@/data/queries/growHoldings';
import type { HoldingLotRow } from '@/db/holdingLots';
import { usePastContext } from '@/features/decide/past/usePastDecisions';
import { LineChart } from '@/features/grow/ui/LineChart';
import { StateBadge } from '@/features/grow/ui/StateBadge';
import { netWorthOf } from '@/features/grow/netWorth';
import { useT } from '@/i18n';
import { undoLabelText } from '@/i18n/undoLabel';
import { DetailScreen } from '@/shell/screen/DetailScreen';
import { pushOnce } from '@/shell/navigation/pushOnce';
import { showToast } from '@/state/undoToast';
import { radii, space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { textRole } from '@/theme/typography';
import { ConfirmSheet } from '@/ui/ConfirmSheet';
import { Pill } from '@/ui/Pill';
import { Text } from '@/ui/Text';
import { LotSheet } from './LotSheet';
import { UpdateValueSheet } from './UpdateValueSheet';
import { tenthsText, useInvestingFormat } from './investingFormat';
import { GainBadge } from './InvestingSegment';
import { useInvestingRead } from './useInvestingRead';

export interface HoldingDetailScreenProps {
  id: string;
}

const KIND_KEY = { buy: 'buy', sell: 'sale', dividend: 'dividend', fee: 'fee', value: 'value' } as const;

export function HoldingDetailScreen({ id }: HoldingDetailScreenProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const f = useInvestingFormat();
  const read = useInvestingRead();
  const past = usePastContext();
  const holdingsQuery = useHoldingRows(read.userId ?? undefined, read.householdId ?? undefined);
  const lotsQuery = useHoldingLotRows(read.userId ?? undefined, read.householdId ?? undefined);
  const accounts = useAccounts(read.householdId ?? undefined).data;
  const { balances } = useAccountBalances(read.householdId, accounts ?? []);
  const { remove } = useEditHolding();
  const [updating, setUpdating] = useState(false);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState(false);

  const holding = holdingsQuery.data?.find((h) => h.id === id && h.deleted_at === null) ?? null;
  const line = read.model.holdings.find((h) => h.id === id) ?? null;
  const lots = useMemo<HoldingLotRow[]>(
    () => (lotsQuery.data ?? []).filter((l) => l.holding_id === id && l.deleted_at === null),
    [lotsQuery.data, id]
  );

  const toHome = (amount: number, currency: string): number | null =>
    amount === 0 || currency === past.ctx.home ? amount : (convertLatest(amount, currency, past.ctx.home, past.ctx.rates, past.ctx.customs, past.ctx.today)?.amount ?? null);

  // "Net worth drops by": net worth with this holding minus net worth without it, by the one D-26 rule.
  const netWorthDrop = (): number => {
    if (holding === null) return 0;
    const bal = new Map<string, number>();
    for (const a of accounts ?? []) {
      const b = balances.get(a.id);
      const home = b && !b.overflow && b.balance !== null ? toHome(b.balance, a.currency) : 0;
      bal.set(a.id, home ?? 0);
    }
    const live = (holdingsQuery.data ?? []).filter((h) => h.deleted_at === null);
    const asNet = (hs: typeof live) =>
      hs.flatMap((h) => {
        const v = toHome(h.value, h.currency);
        return v === null ? [] : [{ account_id: h.account_id, value: v }];
      });
    const base = { accounts: accounts ?? [], balances: bal, debts: [] as never[] };
    const withIt = netWorthOf({ ...base, holdings: asNet(live) });
    const without = netWorthOf({ ...base, holdings: asNet(live.filter((h) => h.id !== id)) });
    return withIt - without;
  };

  if (holding === null && holdingsQuery.data !== undefined) {
    return (
      <DetailScreen title="">
        <View testID="grow-holding-missing" style={[styles.card, styles.missing, { backgroundColor: colors.surface, borderColor: colors.line1 }]}>
          <Text accessibilityRole="header" style={{ ...textRole(pairing, 'body'), color: colors.ink, textAlign: 'center' }}>{t('grow.investing.notFoundTitle')}</Text>
          <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted, textAlign: 'center' }}>{t('grow.common.notFoundBody')}</Text>
          <Pill label={t('grow.common.back')} variant="secondary" onPress={() => router.back()} />
        </View>
      </DetailScreen>
    );
  }
  if (holding === null || line === null) {
    return <DetailScreen title={t('grow.investing.section')}>{null}</DetailScreen>;
  }

  const label = textRole(pairing, 'label');
  const body = textRole(pairing, 'body');
  const up = line.gain >= 0;
  const asOfText = f.day(line.asOf);
  const entries = [...lots].sort((a, b) => (a.local_date < b.local_date ? 1 : a.local_date > b.local_date ? -1 : 0));
  const history = lots.filter((l) => l.kind === 'value').sort((a, b) => (a.local_date < b.local_date ? -1 : 1));
  const points = history.length > 0 ? history.map((l) => l.amount) : [holding.value];
  const firstDate = history[0]?.local_date ?? line.asOf;
  const paidFrom = accounts?.find((a) => a.id === holding.paid_from_account_id)?.name ?? null;
  const gainLine =
    line.gainPercentTenths !== null
      ? t('grow.investing.detail.gainLine', {
          amount: f.money(Math.abs(line.gain), line.currency),
          direction: t(up ? 'grow.investing.above' : 'grow.investing.below'),
          putIn: f.money(line.putIn, line.currency),
          percent: tenthsText(Math.abs(line.gainPercentTenths)),
        })
      : t('grow.investing.detail.gainLineNoPercent', {
          amount: f.money(Math.abs(line.gain), line.currency),
          direction: t(up ? 'grow.investing.above' : 'grow.investing.below'),
          putIn: f.money(line.putIn, line.currency),
        });

  const rows: { key: string; label: string; value: string }[] = [
    { key: 'type', label: t('grow.investing.detail.type'), value: t(`grow.investing.types.${holding.type}`) },
  ];
  if (holding.monthly_amount !== null && holding.monthly_amount > 0) {
    rows.push({
      key: 'monthly',
      label: t('grow.investing.detail.eachMonth'),
      value:
        holding.day !== null
          ? t('grow.investing.detail.eachMonthValue', { amount: f.money(holding.monthly_amount, holding.currency), day: holding.day })
          : f.money(holding.monthly_amount, holding.currency),
    });
  }
  if (paidFrom !== null) rows.push({ key: 'paidFrom', label: t('grow.investing.detail.paidFrom'), value: paidFrom });

  const confirmRemove = () => {
    setRemoving(false);
    if (read.userId === null) return;
    const stepId = remove(holding, read.userId);
    showToast({ kind: 'destructive', text: undoLabelText('holdingRemoved', { name: holding.name }), stepId });
    router.back();
  };

  const card = [styles.card, { backgroundColor: colors.surface, borderColor: colors.line1 }];

  return (
    <DetailScreen title={holding.name}>
      <View testID="holding-detail" style={styles.stack}>
        <View style={card}>
          <Text testID="holding-value" style={{ ...textRole(pairing, 'display'), color: colors.ink }}>{f.money(line.value, line.currency)}</Text>
          <StateBadge tone="slate" shape="sClock" label={t('grow.investing.detail.asOfBadge', { date: asOfText })} accessibilityLabel={`${f.money(line.value, line.currency)} ${t('grow.investing.detail.asOfA11y', { date: asOfText })}`} />
          <View style={styles.gainRow}>
            <GainBadge line={line} />
            <Text testID="holding-gain-line" style={{ ...label, color: colors.inkMuted, flex: 1 }}>{gainLine}</Text>
          </View>
          <LineChart
            points={points}
            accessibilityLabel={t('grow.investing.detail.chartA11y', {
              from: f.day(firstDate),
              to: asOfText,
              value: f.money(line.value, line.currency),
            })}
          />
        </View>

        <View style={[card, { padding: 0 }]}>
          {rows.map((r, i) => (
            <View key={r.key} style={[styles.row, i > 0 ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line1 } : null]}>
              <Text style={{ ...label, color: colors.inkMuted }}>{r.label}</Text>
              <Text style={{ ...body, color: colors.ink }}>{r.value}</Text>
            </View>
          ))}
        </View>

        {line.stale ? (
          <Pressable
            testID="holding-stale-row"
            accessibilityRole="button"
            onPress={() => setUpdating(true)}
            style={[card, styles.between]}
          >
            <Text style={{ ...body, color: colors.ink }}>{t('grow.investing.staleRow')}</Text>
            <Text style={{ ...label, color: colors.inkMuted }}>{t('grow.investing.staleSub', { date: asOfText })}</Text>
          </Pressable>
        ) : null}

        <Pill label={t('grow.investing.detail.updateValue')} variant="primary" onPress={() => setUpdating(true)} />

        {holding.rate !== null && holding.rate !== '' ? (
          <Pressable
            testID="holding-growth-row"
            accessibilityRole="button"
            onPress={() =>
              pushOnce({
                pathname: '/grow/calculators/illustration',
                params: { start: String(Math.max(0, holding.value)), rate: holding.rate ?? '', monthly: String(holding.monthly_amount ?? 0) },
              } as Href)
            }
            style={styles.link}
          >
            <Text style={{ ...body, color: colors.accent }}>{t('grow.investing.detail.seeGrowth')}</Text>
          </Pressable>
        ) : null}

        <Pressable testID="holding-add-entry" accessibilityRole="button" onPress={() => setAdding(true)} style={styles.link}>
          <Text style={{ ...body, color: colors.accent }}>{t('grow.investing.detail.addEntry')}</Text>
        </Pressable>

        <Text accessibilityRole="header" style={{ ...label, color: colors.inkMuted }}>{t('grow.investing.detail.entries')}</Text>
        {entries.length === 0 ? (
          <View style={card}>
            <Text style={{ ...body, color: colors.ink }}>{t('grow.investing.detail.entriesEmptyTitle')}</Text>
            <Text style={{ ...label, color: colors.inkMuted }}>{t('grow.investing.detail.entriesEmptyBody')}</Text>
          </View>
        ) : (
          <View style={[card, { padding: 0 }]}>
            {entries.map((l, i) => (
              <View
                key={l.id}
                testID={`entry-${l.id}`}
                style={[styles.row, i > 0 ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line1 } : null]}
              >
                <Text style={{ ...body, color: colors.ink, flex: 1 }}>
                  {t('grow.investing.entry.row', {
                    kind: t(`grow.investing.entry.${KIND_KEY[l.kind]}`),
                    date: f.day(l.local_date),
                    amount: f.money(l.amount, holding.currency),
                  })}
                </Text>
              </View>
            ))}
          </View>
        )}

        <Text style={{ ...label, color: colors.inkMuted }}>{t('grow.investing.taxNote')}</Text>
        <Pill label={t('grow.investing.detail.remove')} variant="danger" onPress={() => setRemoving(true)} />
      </View>

      <UpdateValueSheet visible={updating} holding={holding} onClose={() => setUpdating(false)} />
      <LotSheet visible={adding} holding={holding} lots={lots} onClose={() => setAdding(false)} />
      <ConfirmSheet
        visible={removing}
        title={t('grow.investing.detail.removeTitle', { name: holding.name })}
        body={t('grow.investing.detail.removeBody', { amount: f.money(netWorthDrop()) })}
        cancelLabel={t('grow.investing.detail.removeKeep')}
        confirmLabel={t('grow.investing.detail.removeConfirm')}
        destructive
        onConfirm={confirmRemove}
        onCancel={() => setRemoving(false)}
      />
    </DetailScreen>
  );
}

const styles = StyleSheet.create({
  stack: { gap: space.gapSm },
  missing: { alignItems: 'center' },
  card: { gap: space.gapSm, borderWidth: 1, borderRadius: radii.card, padding: space.cardPadLg },
  gainRow: { flexDirection: 'row', alignItems: 'center', gap: space.gapSm },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.gapSm, padding: space.cardPad, minHeight: space.touchMin },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  link: { minHeight: space.touchMin, justifyContent: 'center' },
});
