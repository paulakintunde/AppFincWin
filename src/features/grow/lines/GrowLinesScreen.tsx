// 06-16 (G10, D-27): "Your money rules". The safety net and the three rules Decide keeps every answer to, each with where it stands
// now. Built on the EXISTING lines store (decide_settings dsr_line, investing_floor, saving_floor): no new table, nothing stored
// twice. The safety net row opens the safety-net screen; the others open LineSheet. A rule with no figure of its own shows the
// engine's default, tagged as such. The copy says these are the user's own limits.
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useDecideSettings, useDecideSnapshot } from '@/data/queries/decide';
import { prepareContext } from '@/engine/decide';
import { useT } from '@/i18n';
import { percentText } from '@/features/decide/copy/percentText';
import { monthBreakdown } from '@/features/decide/home/homeCardModel';
import { useGoalsRead } from '@/features/grow/goals/useGoalsRead';
import { useGoalMoney } from '@/features/grow/home/GoalsSegment';
import { GrowGlyph, type GrowGlyphName } from '@/features/grow/ui/GrowGlyph';
import { StateBadge } from '@/features/grow/ui/StateBadge';
import { useRecordContext } from '@/features/record/useRecordContext';
import { pushOnce } from '@/shell/navigation/pushOnce';
import { DetailScreen } from '@/shell/screen/DetailScreen';
import { showToast } from '@/state/undoToast';
import { radii, space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { textRole } from '@/theme/typography';
import { Text } from '@/ui/Text';
import { LineSheet, type MoneyRule } from './LineSheet';

const NET_HREF = '/grow/safety-net' as const;

interface LineRowProps {
  testID: string;
  glyph: GrowGlyphName;
  name: string;
  sub: string;
  value: string;
  isDefault: boolean;
  status: React.ReactNode;
  onPress: () => void;
}

function LineRow({ testID, glyph, name, sub, value, isDefault, status, onPress }: LineRowProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={`${name}, ${value}${isDefault ? `, ${t('decide.lines.defaultTag')}` : ''}, ${sub}`}
      onPress={onPress}
      style={styles.row}
    >
      <View style={[styles.tile, { backgroundColor: colors.fill1 }]}>
        <GrowGlyph name={glyph} color={colors.accent} size={22} />
      </View>
      <View style={styles.text}>
        <Text style={{ ...textRole(pairing, 'body'), color: colors.ink }}>{name}</Text>
        <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>{sub}</Text>
        {status}
      </View>
      <View style={styles.valueCol}>
        <Text style={{ ...textRole(pairing, 'body'), color: colors.ink, fontVariant: ['tabular-nums'] }}>{value}</Text>
        {isDefault ? <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>{t('decide.lines.defaultTag')}</Text> : null}
      </View>
      <GrowGlyph name="chev" color={colors.inkFaint} size={16} />
    </Pressable>
  );
}

export function GrowLinesScreen() {
  const t = useT() as (key: string, params?: Record<string, string | number>) => string;
  const { colors, pairing } = useTheme();
  const rc = useRecordContext();
  const money = useGoalMoney();
  const read = useGoalsRead();
  const settings = useDecideSettings(rc.userId ?? undefined).data ?? null;
  const snapshot = useDecideSnapshot();
  const [editing, setEditing] = useState<MoneyRule | null>(null);

  const result = snapshot.result;
  const logged = result !== null && result.kind === 'logged' ? result : null;
  const limits = useMemo(() => {
    if (logged === null) return null;
    const ctx = prepareContext(logged.snapshot);
    return ctx.ok ? ctx.context.limits : null;
  }, [logged]);
  const breakdown = useMemo(() => (result === null ? null : monthBreakdown(result, rc.today)), [result, rc.today]);
  const currency = result?.currency ?? rc.homeCurrency;

  const foreign = settings !== null && settings.currency !== null && settings.currency !== currency;
  const dsrStored = settings?.dsr_line ?? null;
  const dsrPct = dsrStored ?? (limits === null ? null : percentText(limits.dsrLine));
  const investingStored = settings === null || foreign ? null : settings.investing_floor;
  const savingStored = settings === null || foreign ? null : settings.saving_floor;
  const investingFloor = investingStored ?? (limits === null ? null : limits.investingFloor);
  const savingFloor = savingStored ?? (limits === null ? null : limits.savingFloor);
  const monthlyInvesting = logged === null ? 0 : logged.snapshot.monthlyInvesting;
  const monthlySaving = logged === null ? 0 : logged.snapshot.monthlySaving;
  const debtNow = breakdown === null || breakdown.income <= 0 ? null : Math.round((breakdown.debts / breakdown.income) * 100);

  const defaults: Record<MoneyRule, number> = {
    debt: dsrPct === null ? 36 : Number(dsrPct),
    investing: investingFloor ?? 0,
    saving: savingFloor ?? 0,
  };

  const net = read.model.safetyNet;
  const netSize = net !== null && net.size !== null && net.size > 0 ? net.size : null;

  const met = (set: number, floor: number | null) =>
    floor === null ? null : (
      <StateBadge
        tone={set >= floor ? 'accent' : 'slate'}
        shape={set >= floor ? 'sCheck' : 'sClock'}
        label={t(set >= floor ? 'grow.lines.met' : 'grow.lines.notMet', { amount: money.amount(set) })}
      />
    );

  const card = [styles.card, { backgroundColor: colors.surface, borderColor: colors.line1 }];
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
            status={
              <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>
                {netSize === null ? t('grow.safetyNet.emptyAction') : t('grow.lines.safetyNetStatus', { target: money.amount(netSize) })}
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
            value={investingFloor === null ? '—' : money.amount(investingFloor)}
            isDefault={investingStored === null}
            status={met(monthlyInvesting, investingFloor)}
            onPress={() => setEditing('investing')}
          />
          <LineRow
            testID="lines-row-saving"
            glyph="savings"
            name={t('grow.lines.saving')}
            sub={t('grow.lines.savingSub')}
            value={savingFloor === null ? '—' : money.amount(savingFloor)}
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
  card: { borderWidth: 1, borderRadius: radii.card, paddingHorizontal: space.cardPad, gap: space.gapSm },
  row: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: space.gapMd, paddingVertical: space.gapMd },
  tile: { width: 36, height: 36, borderRadius: radii.glyphTile, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, gap: 2, alignItems: 'flex-start' },
  valueCol: { alignItems: 'flex-end' },
});
