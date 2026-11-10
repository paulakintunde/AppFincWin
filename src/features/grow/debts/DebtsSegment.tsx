// 06-17 (G05): the Debts segment of Grow. Hero (total debt and when the minimum clears it), the debt-payment line card, the debt
// rows, cards paid in full, and the payoff plan card with both orders side by side. Everything comes from useDebtsRead (06-14),
// which composes the engine; this file only lays it out. The segment owns its Add a debt sheet: GrowHome's FAB can open it with
// `addOpen` / `onAddClosed`, and the segment's own buttons open it without any wiring.
import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { Href } from 'expo-router';
import { useAccounts } from '@/data/queries/accounts';
import { useRemoveDebt } from '@/data/mutations/debts';
import type { DebtRow } from '@/db/debts';
import { DeletableRow } from '@/features/decide/ui/DeletableRow';
import { extraStartDate, oneOffDate, useRecordDebtOneOff, useSaveDebtPlan } from '@/data/mutations/growDebts';
import type { PayoffOrder } from '@/engine/payoff';
import { useT } from '@/i18n';
import { AccTile } from '@/features/grow/ui/AccTile';
import { GrowGlyph } from '@/features/grow/ui/GrowGlyph';
import { ProgressBar } from '@/features/grow/ui/ProgressBar';
import { StateBadge } from '@/features/grow/ui/StateBadge';
import { pushOnce } from '@/shell/navigation/pushOnce';
import { showToast } from '@/state/undoToast';
import { PRESSED_OPACITY, radii, space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { shadows } from '@/theme/tokens';
import { fontSize, textRole } from '@/theme/typography';
import { hapticLight } from '@/ui/haptics';
import { Pill } from '@/ui/Pill';
import { Text } from '@/ui/Text';
import { AddDebtSheet } from './AddDebtSheet';
import { debtLineModel, firstClearedDate } from './debtLineModel';
import { debtHref, payAccountId, useDebtFormat, useDebtMonth, useDebtRows, type DebtFormat } from './debtScreenData';
import { PayoffPlanCard, type ScenarioKey } from './PayoffPlanCard';
import {
  buildDebtsModel,
  DEFAULT_EXTRA,
  DEFAULT_LUMP,
  minimumOnlyFor,
  savedPlanFor,
  useDebtsRead,
  type DebtLine,
  type DebtsRead,
} from './useDebtsRead';
import { useDebts } from '@/data/queries/decide';

/** The debt-payment rule when none is set: 36%, as Your money rules shows it (GrowLinesScreen). */
const DEFAULT_DEBT_RULE = '36';

export interface DebtsSegmentProps {
  /** The FAB asks for the Add a debt sheet. */
  addOpen?: boolean;
  /** The sheet closed (so the owner can clear `addOpen`). */
  onAddClosed?: () => void;
}


export function DebtsSegment({ addOpen = false, onAddClosed }: DebtsSegmentProps) {
  const t = useT() as (key: string, options?: Record<string, string | number>) => string;
  const { colors, pairing } = useTheme();
  const read = useDebtsRead();
  const fmt = useDebtFormat();
  const [ownOpen, setOwnOpen] = useState(false);
  const open = ownOpen || addOpen;
  const closeAdd = useCallback(() => {
    setOwnOpen(false);
    onAddClosed?.();
  }, [onAddClosed]);
  const card = [styles.card, { backgroundColor: colors.surface, ...shadows.card }];
  const sheet = open ? <AddDebtSheet visible onClose={closeAdd} /> : null;

  if (read.status === 'loading') {
    return (
      <View testID="grow-debts-loading" accessibilityLabel={t('grow.home.loading')} style={styles.stack}>
        <View style={[styles.block, { height: 96, backgroundColor: colors.fill1 }]} />
        <View style={[styles.block, { height: 128, backgroundColor: colors.fill1 }]} />
      </View>
    );
  }
  if (read.status === 'error') {
    return (
      <View testID="grow-debts-error" style={[...card, styles.center]}>
        <Text style={{ ...textRole(pairing, 'body'), color: colors.ink, textAlign: 'center' }}>{t('grow.common.loadErrorTitle')}</Text>
        <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted, textAlign: 'center' }}>{t('grow.common.loadErrorBody')}</Text>
        <Pill label={t('grow.common.tryAgain')} variant="secondary" onPress={read.refetch} />
      </View>
    );
  }

  const model = read.model;
  if (model.debts.length === 0 && model.paidInFull.length === 0) {
    return (
      <>
        <View testID="grow-debts-empty" style={[...card, styles.center]}>
          <GrowGlyph name="debt" color={colors.accent} size={28} />
          <Text style={{ ...textRole(pairing, 'body'), color: colors.ink, textAlign: 'center' }}>{t('grow.debts.emptyTitle')}</Text>
          <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted, textAlign: 'center' }}>{t('grow.debts.emptyBody')}</Text>
          <Pill label={t('grow.debts.emptyAction')} variant="primary" onPress={() => setOwnOpen(true)} />
        </View>
        {sheet}
      </>
    );
  }
  return (
    <>
      <DebtsBody read={read} onAdd={() => setOwnOpen(true)} fmt={fmt} />
      {sheet}
    </>
  );
}

function DebtsBody({ read, onAdd, fmt }: { read: DebtsRead; onAdd: () => void; fmt: DebtFormat }) {
  const t = useT() as (key: string, options?: Record<string, string | number>) => string;
  const { colors, pairing } = useTheme();
  const { model, today, userId, householdId } = read;
  const month = useDebtMonth();
  const rows = useDebtRows(householdId);
  const rowQuery = useDebts(householdId ?? undefined).data;
  const accounts = useAccounts(householdId ?? undefined).data ?? [];
  const planSave = useSaveDebtPlan();
  const recordOnce = useRecordDebtOneOff();
  const { remove: removeDebt } = useRemoveDebt();
  const [editing, setEditing] = useState<DebtRow | null>(null);

  const [extra, setExtra] = useState(model.extra > 0 ? model.extra : DEFAULT_EXTRA);
  // The user's tap, or the order they saved before. Nothing is picked for them.
  const [picked, setOrder] = useState<PayoffOrder | null>(null);
  const order = picked ?? model.savedOrder;
  const [scenario, setScenario] = useState<ScenarioKey>('extra');
  const [lump, setLump] = useState(DEFAULT_LUMP);

  const whatIf = useMemo(
    () => (rowQuery === undefined ? model : buildDebtsModel(rowQuery, today, { extra, lump })),
    [rowQuery, today, extra, lump, model]
  );

  const currency = model.planCurrency ?? model.debts[0]?.currency ?? model.paidInFull[0]?.currency ?? 'USD';
  const inPlan = model.debts.filter((d) => d.inPlan);
  const total = inPlan.reduce((s, d) => s + d.point.balance, 0);
  const monthly = inPlan.reduce((s, d) => s + d.point.minimum + d.extra, 0);
  // The order shown: the user's pick, the saved one, or (one debt) either. 2+ debts and none: the later date, no pick.
  const shownOrder: PayoffOrder | null = order ?? (model.oneDebt ? 'rate' : null);
  const heroMinimum = model.scenarios === null ? null : minimumOnlyFor(model.scenarios, shownOrder);
  const heroNote = heroMinimum?.payoffDate ? t('grow.debts.heroNote', { date: fmt.monthYear(heroMinimum.payoffDate) }) : t('grow.debts.heroNoteNone');
  const heroSaved = model.savedExtraPlan === null ? null : savedPlanFor(model.savedExtraPlan, model.savedOrder ?? shownOrder);
  const heroExtra =
    heroSaved?.payoffDate == null
      ? null
      : t('grow.debts.heroNoteExtra', { amount: fmt.money(model.extra, currency), date: fmt.monthYear(heroSaved.payoffDate) });

  // D14: with no rule set, the default rule shows, marked as the default.
  const ruleIsDefault = month.rule === null;
  const rule = month.rule ?? DEFAULT_DEBT_RULE;
  const lineModel = month.usualPay === null ? null : debtLineModel(monthly, month.usualPay, rule);
  const sharePercent = lineModel === null ? null : lineModel.sharePercent;
  const over = lineModel !== null && lineModel.over;

  // D-34: one debt carries the extra. Keep it on the debt that already has one; else the first debt in the order shown
  // (one debt: that debt; 2+ debts with no order: none yet, and the card asks for an order).
  const carrierId = inPlan.find((d) => d.extra > 0)?.id ?? null;
  const firstId = shownOrder === null || whatIf.scenarios === null ? null : whatIf.scenarios[shownOrder].lumpFirstDebtId;
  const extraRow = rows.get(carrierId ?? firstId ?? '');
  const carrierRow = carrierId === null ? undefined : rows.get(carrierId);
  const onceRow = firstId === null ? undefined : rows.get(firstId);
  const extraFrom = extraRow === undefined ? today : extraStartDate(extraRow, today);
  const stopFrom = carrierRow === undefined ? extraFrom : extraStartDate(carrierRow, today);
  const onceOn = oneOffDate(today);
  // The stepper at $0 stops a saved extra rather than saving nothing (D-32); there is no early return for it.
  const stepperOn = extra > 0;

  const useExtra = (): void => {
    if (extraRow === undefined || userId === null || !stepperOn || shownOrder === null) return;
    const accountId = payAccountId(extraRow, accounts);
    if (accountId === null) return;
    try {
      const { stepId } = planSave.save({
        ownerId: userId,
        debt: extraRow,
        extra,
        order,
        paidFromAccountId: accountId,
        seriesName: t('grow.debts.extraSeriesName', { name: extraRow.name }),
      });
      hapticLight();
      showToast({
        kind: 'ordinary',
        text: { key: 'grow.debts.planSavedToastFrom', params: { amount: fmt.money(extra, currency), date: fmt.dayMonth(extraFrom) } },
        stepId,
      });
    } catch {
      showToast({ kind: 'refusal', text: { key: 'grow.common.saveFailed' } });
    }
  };

  const stopExtra = (): void => {
    if (carrierRow === undefined || userId === null) return;
    try {
      const { stepId } = planSave.save({ ownerId: userId, debt: carrierRow, extra: 0, order, paidFromAccountId: null });
      hapticLight();
      showToast({ kind: 'ordinary', text: { key: 'grow.debts.stopToast', params: { date: fmt.dayMonth(stopFrom) } }, stepId });
    } catch {
      showToast({ kind: 'refusal', text: { key: 'grow.common.saveFailed' } });
    }
  };

  const useOnce = (): void => {
    if (onceRow === undefined || userId === null || lump <= 0 || lump > onceRow.balance) return;
    const accountId = payAccountId(onceRow, accounts);
    if (accountId === null) return;
    try {
      const { stepId } = recordOnce.record({
        ownerId: userId,
        debt: onceRow,
        amount: lump,
        paidFromAccountId: accountId,
        name: t('grow.debts.oneOffLineName', { name: onceRow.name }),
      });
      hapticLight();
      showToast({
        kind: 'ordinary',
        text: { key: 'grow.debts.onceToast', params: { amount: fmt.money(lump, currency), name: onceRow.name, date: fmt.dayMonth(onceOn) } },
        stepId,
      });
    } catch {
      showToast({ kind: 'refusal', text: { key: 'grow.common.saveFailed' } });
    }
  };

  const onceLine = firstId === null ? null : model.debts.find((d) => d.id === firstId) ?? null;

  const line = { ...textRole(pairing, 'label'), color: colors.inkMuted };
  const card = [styles.card, { backgroundColor: colors.surface, ...shadows.card }];

  const removeRow = (debt: DebtRow): void => {
    if (userId === null) return;
    try {
      const stepId = removeDebt(debt, userId);
      hapticLight();
      showToast({ kind: 'destructive', text: { key: 'grow.debts.detail.removedToast', params: { name: debt.name } }, stepId });
    } catch {
      showToast({ kind: 'refusal', text: { key: 'grow.common.saveFailed' } });
    }
  };

  const subOf = (d: DebtLine, paidInFull: boolean): string => {
    if (paidInFull) return t('grow.debts.paidInFullRow');
    const rate = fmt.rate(rows.get(d.id)?.apr ?? null);
    const payment = fmt.money(d.point.minimum, d.currency);
    const day = d.point.dueDay === null ? null : fmt.ordinal(d.point.dueDay);
    const end = d.endDate === null ? null : fmt.monthYear(d.endDate);
    const key =
      (end === null ? 'grow.debts.row' : 'grow.debts.rowEnds') + (rate === null ? (day === null ? 'NoDayNoRate' : 'NoRate') : day === null ? 'NoDay' : '');
    return t(key, { rate: rate ?? '', payment, day: day ?? '', end: end ?? '' });
  };

  const row = (d: DebtLine, paidInFull: boolean, index: number) => {
    const stored = rows.get(d.id);
    const sub = subOf(d, paidInFull);
    const content = (
      <View testID={`grow-debt-row-${d.id}`} style={styles.row}>
        <AccTile glyph={d.kind === 'card' ? 'card' : 'debt'} />
        <View style={styles.flex}>
          <Text style={{ ...textRole(pairing, 'bodyStrong'), color: colors.ink }}>{d.name}</Text>
          <Text style={line}>{sub}</Text>
          {d.minimumEstimated ? <StateBadge tone="slate" shape="sQuestion" label={t('grow.debts.minimumEstimated')} /> : null}
        </View>
        <Text style={{ ...textRole(pairing, 'bodyStrong'), color: colors.ink, fontVariant: ['tabular-nums'] }}>{fmt.money(d.point.balance, d.currency)}</Text>
      </View>
    );
    return (
      <View key={d.id} style={index > 0 ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line1 } : null}>
        <DeletableRow
          name={d.name}
          accessibilityLabel={`${d.name}, ${sub}, ${fmt.spoken(d.point.balance, d.currency)}`}
          onOpen={() => pushOnce(debtHref(d.id))}
          menu={stored === undefined ? [] : [{ key: 'edit', label: t('decide.delete.menuEdit'), onSelect: () => setEditing(stored) }]}
          confirm={{ title: t('grow.debts.detail.removeTitle', { name: d.name }), body: t('grow.debts.detail.removeBody') }}
          onDelete={() => {
            if (stored !== undefined) removeRow(stored);
          }}
          disabled={stored === undefined}
          actionWord={t('grow.home.rowRemove')}
        >
          {content}
        </DeletableRow>
      </View>
    );
  };

  const eyebrow = { ...textRole(pairing, 'label'), fontSize: fontSize.eyebrow, color: colors.inkMuted };
  const recordLine = whatIf.focus === null ? null : model.debts.find((d) => d.id === whatIf.focus?.id) ?? null;

  return (
    <View testID="grow-debts" style={styles.stack}>
      <View testID="grow-debts-hero" style={card}>
        <Text style={line}>{t('grow.debts.heroLabel')}</Text>
        <Text scale="capped" style={{ ...textRole(pairing, 'display'), color: colors.ink, fontVariant: ['tabular-nums'] }}>
          {fmt.money(total, currency)}
        </Text>
        <Text style={line}>{heroNote}</Text>
        {heroExtra === null ? null : <Text style={line}>{heroExtra}</Text>}
      </View>

      {sharePercent === null || lineModel === null ? null : (
        <View testID="grow-debts-line" style={card}>
          <Text style={{ ...textRole(pairing, 'body'), color: colors.ink }}>
            {t(ruleIsDefault ? 'grow.debts.lineCardDefault' : 'grow.debts.lineCard', { percent: sharePercent, rule: Number(rule) })}
          </Text>
          <ProgressBar
            percent={Math.min(100, sharePercent)}
            variant="thin"
            tone={over ? 'ink' : 'accent'}
            animate={false}
            tickPercent={lineModel.line}
            accessibilityLabel={t('grow.debts.lineCardNoRule', { percent: sharePercent })}
          />
          {over ? <StateBadge tone="warn" shape="sOver" label={t('grow.debts.add.overBadge')} /> : null}
        </View>
      )}

      <Text accessibilityRole="header" style={eyebrow}>
        {t('grow.debts.section')}
      </Text>
      <View style={[...card, styles.listCard]}>
        {model.debts.map((d, i) => row(d, false, i))}
        <Pressable
          testID="debts-add-row"
          accessibilityRole="button"
          onPress={onAdd}
          style={({ pressed }) => [
            styles.addRow,
            model.debts.length > 0 ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line1 } : null,
            { opacity: pressed ? PRESSED_OPACITY : 1 },
          ]}
        >
          <Text style={{ ...textRole(pairing, 'body'), color: colors.accent }}>{t('grow.debts.addDebtRow')}</Text>
        </Pressable>
      </View>

      {model.paidInFull.length > 0 ? (
        <>
          <Text accessibilityRole="header" style={eyebrow}>
            {t('grow.debts.paidInFullSection')}
          </Text>
          <View style={[...card, styles.listCard]}>{model.paidInFull.map((d, i) => row(d, true, i))}</View>
        </>
      ) : null}

      {whatIf.scenarios === null ? null : (
        <PayoffPlanCard
          scenarios={whatIf.scenarios}
          oneDebt={model.oneDebt}
          firstCleared={{
            rate: firstClearedDate(model.debts, extra, 'rate', today),
            balance: firstClearedDate(model.debts, extra, 'balance', today),
          }}
          order={order}
          onOrder={setOrder}
          open={scenario}
          onOpen={setScenario}
          extra={extra}
          onExtra={setExtra}
          lump={lump}
          onLump={setLump}
          savedExtra={model.extra}
          lumpDebt={onceLine === null ? null : { name: onceLine.name, balance: onceLine.point.balance }}
          startDates={{ extra: scenario === 'minimum' || !stepperOn ? stopFrom : extraFrom, once: onceOn }}
          onUseExtra={useExtra}
          onStopExtra={stopExtra}
          onUseOnce={useOnce}
          left={month.left}
          fmt={fmt}
          currency={currency}
        />
      )}

      {recordLine === null ? null : (
        <Pressable
          testID="debts-record-row"
          accessibilityRole="button"
          accessibilityLabel={`${t('grow.debts.recordRow', { name: recordLine.name })}. ${t('grow.debts.recordRowSub')}`}
          onPress={() => pushOnce(`/grow/calculators/debt/${recordLine.id}` as Href)}
          style={({ pressed }) => [...card, styles.recordRow, { opacity: pressed ? PRESSED_OPACITY : 1 }]}
        >
          <View style={styles.flex}>
            <Text style={{ ...textRole(pairing, 'bodyStrong'), color: colors.ink }}>{t('grow.debts.recordRow', { name: recordLine.name })}</Text>
            <Text style={line}>{t('grow.debts.recordRowSub')}</Text>
          </View>
          <GrowGlyph name="chev" color={colors.inkFaint} size={16} />
        </Pressable>
      )}

      <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkMuted }}>{t('grow.debts.footer')}</Text>
      {editing === null ? null : <AddDebtSheet visible debt={editing} onClose={() => setEditing(null)} />}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: space.groupGap },
  card: { borderRadius: radii.card, padding: space.cardPadLg, gap: space.gapSm },
  center: { alignItems: 'center' },
  block: { borderRadius: radii.card },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.gapMd, minHeight: 64, paddingVertical: space.gapSm },
  listCard: { gap: 0, paddingVertical: space.gapSm },
  addRow: { minHeight: space.touchMin, justifyContent: 'center' },
  recordRow: { flexDirection: 'row', alignItems: 'center', gap: space.gapMd },
  flex: { flex: 1, gap: 2, alignItems: 'flex-start' },
});
