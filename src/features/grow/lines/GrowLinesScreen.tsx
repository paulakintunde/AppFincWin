// 06-16 (G10, D-27): "Your money rules". The safety net and the three rules Decide keeps every answer to, each with where it stands
// now. Built on the EXISTING lines store (decide_settings dsr_line, investing_floor, saving_floor): no new table, nothing stored
// twice. The safety net row opens the safety-net screen; the others open LineSheet. A rule with no figure of its own shows the
// engine's default, tagged as such. The copy says these are the user's own limits.
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useDecideSettings } from '@/data/queries/decide';
import { useDecideV3 } from '@/data/queries/decideV3';
import { useSavingsGoalRows } from '@/data/queries/growGoals';
import { standingPlans } from '@/engine/month';
import { currencyCode, minorUnits } from '@/engine/money';
import { currencyExponent } from '@/engine/money/currencyExponents';
import { useT } from '@/i18n';
import { monthBreakdown } from '@/features/grow/lines/monthBreakdown';
import { planFromMonthly } from '@/features/grow/goals/goalPlanModel';
import { useGoalsRead } from '@/features/grow/goals/useGoalsRead';
import { useGoalMoney } from '@/features/grow/home/useGoalMoney';
import { GrowGlyph, type GrowGlyphName } from '@/features/grow/ui/GrowGlyph';
import { StateBadge } from '@/features/grow/ui/StateBadge';
import { useRecordContext } from '@/features/record/useRecordContext';
import { pushOnce } from '@/shell/navigation/pushOnce';
import { DetailScreen } from '@/shell/screen/DetailScreen';
import { showToast } from '@/state/undoToast';
import { radii, space } from '@/theme/layout';
import { categorySwatch, shadows } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';
import { textRole } from '@/theme/typography';
import { useMoneyFormatter } from '@/ui/money/useMoneyFormatter';
import { Text } from '@/ui/Text';
import { LineSheet, type MoneyRule } from './LineSheet';

/** The engine's default debt-payment line, 36% (src/engine/decide/lineDefaults.ts DEFAULT_DSR_LINE), as the text the screen shows. */
const DEFAULT_DSR_TEXT = '36';
const NET_HREF = '/grow/safety-net' as const;

interface LineRowProps {
  testID: string;
  glyph: GrowGlyphName;
  name: string;
  sub: string;
  value: string;
  isDefault: boolean;
  /** R2: the safety-net row wears the navy tile. */
  navy?: boolean;
  status: React.ReactNode;
  onPress: () => void;
}

function LineRow({ testID, glyph, name, sub, value, isDefault, navy = false, status, onPress }: LineRowProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={`${name}, ${value}${isDefault ? `, ${t('grow.lines.defaultSub')}` : ''}, ${sub}`}
      onPress={onPress}
      style={styles.row}
    >
      <View style={[styles.tile, { backgroundColor: navy ? categorySwatch.blue.tint : colors.fill1 }]}>
        <GrowGlyph name={glyph} color={navy ? categorySwatch.blue.color : colors.accent} size={22} />
      </View>
      <View style={styles.text}>
        <Text style={{ ...textRole(pairing, 'body'), color: colors.ink }}>{name}</Text>
        <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>{sub}</Text>
        {isDefault ? <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>{t('grow.lines.defaultSub')}</Text> : null}
        {status}
      </View>
      <View style={styles.valueCol}>
        <Text style={{ ...textRole(pairing, 'body'), color: colors.ink, fontVariant: ['tabular-nums'] }}>{value}</Text>
      </View>
      <GrowGlyph name="chev" color={colors.inkFaint} size={16} />
    </Pressable>
  );
}

/** P4-IN-01: true when `minor` is a whole number of units in `currency` (by its own exponent: 100 for USD, 1000 for BHD). */
export function isWholeAmount(minor: number, currency: string): boolean {
  return minor % 10 ** currencyExponent(currency) === 0;
}

export function GrowLinesScreen() {
  const t = useT() as (key: string, params?: Record<string, string | number>) => string;
  const { colors, pairing } = useTheme();
  const rc = useRecordContext();
  const money = useGoalMoney();
  const read = useGoalsRead();
  const settings = useDecideSettings(rc.userId ?? undefined).data ?? null;
  const { prepared } = useDecideV3();
  const rowsQ = useSavingsGoalRows(rc.userId ?? undefined, rc.householdId ?? undefined);
  const [editing, setEditing] = useState<MoneyRule | null>(null);

  // 05.5-26: the month's figures come from the v3 Prepared (the same one Decide reads), never from the old prepareContext.
  const breakdown = useMemo(() => monthBreakdown(prepared), [prepared]);
  const plans = useMemo(() => (prepared === null ? null : standingPlans(prepared)), [prepared]);
  const currency = prepared?.inputs.currency ?? rc.homeCurrency;

  const foreign = settings !== null && settings.currency !== null && settings.currency !== currency;
  const dsrStored = settings?.dsr_line ?? null;
  // A rule with no figure of its own reads the engine's default (36%, lineDefaults DEFAULT_DSR_LINE); the floors default to what is set up now.
  const dsrPct = dsrStored ?? (prepared === null ? null : DEFAULT_DSR_TEXT);
  const investingStored = settings === null || foreign ? null : settings.investing_floor;
  const savingStored = settings === null || foreign ? null : settings.saving_floor;
  const monthlyInvesting = plans === null ? 0 : plans.investing;
  const monthlySaving = plans === null ? 0 : plans.saving;
  const investingFloor = investingStored ?? (plans === null ? null : plans.investing);
  const savingFloor = savingStored ?? (plans === null ? null : plans.saving);
  const debtNow = breakdown === null || breakdown.income <= 0 ? null : Math.round((breakdown.debts / breakdown.income) * 100);

  const defaults: Record<MoneyRule, number> = {
    debt: dsrPct === null ? 36 : Number(dsrPct),
    investing: investingFloor ?? 0,
    saving: savingFloor ?? 0,
  };

  const net = read.model.safetyNet;
  const netSize = net !== null && net.size !== null && net.size > 0 ? net.size : null;
  const netRow = (rowsQ.data ?? []).find((r) => r.is_safety_net === true && r.deleted_at === null) ?? null;
  const netEach = netRow?.monthly_amount ?? 0;
  const netReachesOn =
    net === null || netSize === null || netEach <= 0 ? null : planFromMonthly({ saved: net.saved, target: netSize, monthly: netEach, today: rc.today }).reachesOn;
  // R1: a rule amount shows whole units when it is a whole amount, and keeps its cents otherwise.
  const withCents = useMoneyFormatter(true, currency);
  const ruleAmount = (minor: number) =>
    isWholeAmount(minor, currency) ? money.amount(minor) : withCents.formatMoney({ amount: minorUnits(minor), currency: currencyCode(currency) });

  const met = (set: number, floor: number | null) =>
    floor === null || floor <= 0 ? null : (
      <StateBadge
        tone={set >= floor ? 'accent' : 'slate'}
        shape={set >= floor ? 'sCheck' : 'sClock'}
        label={t(set >= floor ? 'grow.lines.met' : 'grow.lines.notMet', { amount: money.amount(set) })}
      />
    );

  const card = [styles.card, { backgroundColor: colors.surface }, shadows.card];
  return (
    <DetailScreen title={t('grow.lines.title')}>
      <View style={styles.stack}>
        <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>{t('grow.lines.body')}</Text>
        <View style={card}>
          <LineRow
            testID="lines-row-net"
            glyph="lock"
            name={t('grow.lines.safetyNet')}
            sub={t('grow.lines.safetyNetSub')}
            value={money.amount(net === null ? 0 : net.saved)}
            isDefault={false}
            navy
            status={
              <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>
                {netSize === null
                  ? t('grow.safetyNet.emptyAction')
                  : netReachesOn === null
                    ? t('grow.lines.safetyNetStatus', { target: money.amount(netSize) })
                    : t('grow.lines.safetyNetStatusReach', { target: money.amount(netSize), date: money.monthYear(netReachesOn) })}
              </Text>
            }
            onPress={() => pushOnce(NET_HREF)}
          />
          <LineRow
            testID="lines-row-debt"
            glyph="debt"
            name={t('grow.lines.debt')}
            sub={t('grow.lines.debtSub')}
            value={dsrPct === null ? '—' : t('decide.lines.dsr.value', { pct: dsrPct })}
            isDefault={dsrStored === null}
            status={
              debtNow === null ? null : <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>{t('grow.lines.debtStatus', { percent: debtNow })}</Text>
            }
            onPress={() => setEditing('debt')}
          />
          <LineRow
            testID="lines-row-investing"
            glyph="invest"
            name={t('grow.lines.investing')}
            sub={t('grow.lines.investingSub')}
            value={investingFloor === null ? '—' : ruleAmount(investingFloor)}
            isDefault={investingStored === null}
            status={met(monthlyInvesting, investingFloor)}
            onPress={() => setEditing('investing')}
          />
          <LineRow
            testID="lines-row-saving"
            glyph="savings"
            name={t('grow.lines.saving')}
            sub={t('grow.lines.savingSub')}
            value={savingFloor === null ? '—' : ruleAmount(savingFloor)}
            isDefault={savingStored === null}
            status={met(monthlySaving, savingFloor)}
            onPress={() => setEditing('saving')}
          />
        </View>
        <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>{t('grow.lines.note')}</Text>
      </View>
      <LineSheet
        rule={editing}
        userId={rc.userId ?? null}
        currency={currency}
        settings={settings}
        defaults={defaults}
        onClose={() => setEditing(null)}
        onSaved={(undo) => showToast({ kind: 'destructive', text: { key: 'grow.lines.change.savedToast' }, onUndo: undo })}
      />
    </DetailScreen>
  );
}

const styles = StyleSheet.create({
  stack: { gap: space.groupGap, paddingTop: space.groupGap },
  card: { borderRadius: radii.card, paddingHorizontal: space.cardPad, gap: space.gapSm },
  row: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: space.gapMd, paddingVertical: space.gapMd },
  tile: { width: 36, height: 36, borderRadius: radii.glyphTile, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, gap: 2, alignItems: 'flex-start' },
  valueCol: { alignItems: 'flex-end' },
});
