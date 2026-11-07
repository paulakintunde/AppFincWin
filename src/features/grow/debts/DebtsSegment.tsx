// 06-17 (G05): the Debts segment of Grow. Hero (total debt and when the minimum clears it), the debt-payment line card, the debt
// rows, cards paid in full, and the payoff plan card with both orders side by side. Everything comes from useDebtsRead (06-14),
// which composes the engine; this file only lays it out. The segment owns its Add a debt sheet: GrowHome's FAB can open it with
// `addOpen` / `onAddClosed`, and the segment's own buttons open it without any wiring.
import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useAccounts } from '@/data/queries/accounts';
import { useSaveDebtPlan } from '@/data/mutations/growDebts';
import type { PayoffOrder } from '@/engine/payoff';
import { useT } from '@/i18n';
import { GrowGlyph } from '@/features/grow/ui/GrowGlyph';
import { ProgressBar } from '@/features/grow/ui/ProgressBar';
import { StateBadge } from '@/features/grow/ui/StateBadge';
import { pushOnce } from '@/shell/navigation/pushOnce';
import { showToast } from '@/state/undoToast';
import { PRESSED_OPACITY, radii, space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { ACCENT_TINT_OPACITY } from '@/theme/tokens';
import { fontSize, textRole } from '@/theme/typography';
import { hapticLight } from '@/ui/haptics';
import { Pill } from '@/ui/Pill';
import { Text } from '@/ui/Text';
import { AddDebtSheet } from './AddDebtSheet';
import { debtLineModel } from './debtLineModel';
import { debtHref, payAccountId, useDebtFormat, useDebtMonth, useDebtRows, type DebtFormat } from './debtScreenData';
import { PayoffPlanCard, type ScenarioKey } from './PayoffPlanCard';
import { buildDebtsModel, DEFAULT_EXTRA, DEFAULT_LUMP, useDebtsRead, type DebtLine, type DebtsRead } from './useDebtsRead';
import { useDebts } from '@/data/queries/decide';

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
  const card = [styles.card, { backgroundColor: colors.surface, borderColor: colors.line1 }];
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

  const [extra, setExtra] = useState(model.extra > 0 ? model.extra : DEFAULT_EXTRA);
  // The user's tap, or the order they saved before. Nothing is picked for them.
  const [picked, setOrder] = useState<PayoffOrder | null>(null);
  const order = picked ?? model.savedOrder;
  const [scenario, setScenario] = useState<ScenarioKey>('extra');

  const whatIf = useMemo(
    () => (rowQuery === undefined ? model : buildDebtsModel(rowQuery, today, { extra, lump: DEFAULT_LUMP })),
    [rowQuery, today, extra, model]
  );

  const currency = model.planCurrency ?? model.debts[0]?.currency ?? model.paidInFull[0]?.currency ?? 'USD';
  const inPlan = model.debts.filter((d) => d.inPlan);
  const total = inPlan.reduce((s, d) => s + d.point.balance, 0);
  const monthly = inPlan.reduce((s, d) => s + d.point.minimum + d.extra, 0);
  const heroOutcome = model.plan === null ? null : (order === 'balance' ? model.plan.balance : model.plan.rate).withoutExtra;
  const heroNote = heroOutcome?.payoffDate ? t('grow.debts.heroNote', { date: fmt.monthYear(heroOutcome.payoffDate) }) : t('grow.debts.heroNoteNone');

  const lineModel = month.usualPay === null ? null : debtLineModel(monthly, month.usualPay, month.rule ?? '100');
  const sharePercent = lineModel === null ? null : lineModel.sharePercent;
  const over = month.rule !== null && lineModel !== null && lineModel.over;

  const focusId = whatIf.focus?.id ?? null;
  const focusRow = focusId === null ? undefined : rows.get(focusId);

  const useExtra = (): void => {
    if (focusRow === undefined || userId === null || extra <= 0) return;
    const accountId = payAccountId(focusRow, accounts);
    if (accountId === null) return;
    try {
      const { stepId } = planSave.save({
        ownerId: userId,
        debt: focusRow,
        extra,
        order,
        paidFromAccountId: accountId,
        seriesName: t('grow.debts.extraSeriesName', { name: focusRow.name }),
      });
      hapticLight();
      showToast({ kind: 'ordinary', text: { key: 'grow.debts.planSavedToast', params: { amount: fmt.money(extra, currency) } }, stepId });
    } catch {
      showToast({ kind: 'refusal', text: { key: 'grow.common.saveFailed' } });
    }
  };

  const line = { ...textRole(pairing, 'label'), color: colors.inkMuted };
  const card = [styles.card, { backgroundColor: colors.surface, borderColor: colors.line1 }];

  const row = (d: DebtLine, paidInFull: boolean) => {
    const stored = rows.get(d.id);
    const rate = fmt.rate(stored?.apr ?? null);
    const sub = paidInFull
      ? t('grow.debts.paidInFullRow')
      : d.point.dueDay === null
        ? rate !== null
          ? t('grow.debts.rowNoDay', { rate, payment: fmt.money(d.point.minimum, d.currency) })
          : t('grow.debts.rowNoDayNoRate', { payment: fmt.money(d.point.minimum, d.currency) })
        : rate !== null
          ? t('grow.debts.row', { rate, payment: fmt.money(d.point.minimum, d.currency), day: fmt.ordinal(d.point.dueDay) })
          : t('grow.debts.rowNoRate', { payment: fmt.money(d.point.minimum, d.currency), day: fmt.ordinal(d.point.dueDay) });
    return (
      <Pressable
        key={d.id}
        testID={`grow-debt-row-${d.id}`}
        accessibilityRole="button"
        accessibilityLabel={`${d.name}, ${sub}, ${fmt.spoken(d.point.balance, d.currency)}`}
        onPress={() => pushOnce(debtHref(d.id))}
        style={({ pressed }) => [styles.row, { opacity: pressed ? PRESSED_OPACITY : 1 }]}
      >
        <View style={[styles.tile, { backgroundColor: colors.fill1 }]}>
          <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: colors.accent, opacity: ACCENT_TINT_OPACITY, borderRadius: radii.glyphTile }]} />
          <GrowGlyph name={d.kind === 'card' ? 'card' : 'debt'} color={colors.accent} size={22} />
        </View>
        <View style={styles.flex}>
          <Text style={{ ...textRole(pairing, 'body'), color: colors.ink }}>{d.name}</Text>
          <Text style={line}>{sub}</Text>
          {d.minimumEstimated ? <StateBadge tone="slate" shape="sQuestion" label={t('grow.debts.minimumEstimated')} /> : null}
        </View>
        <Text style={{ ...textRole(pairing, 'body'), color: colors.ink, fontVariant: ['tabular-nums'] }}>{fmt.money(d.point.balance, d.currency)}</Text>
        <GrowGlyph name="chev" color={colors.inkFaint} size={16} />
      </Pressable>
    );
  };

  return (
    <View testID="grow-debts" style={styles.stack}>
      <View testID="grow-debts-hero" style={card}>
        <Text style={line}>{t('grow.debts.heroLabel')}</Text>
        <Text style={{ ...textRole(pairing, 'heading'), color: colors.ink, fontVariant: ['tabular-nums'] }}>{fmt.money(total, currency)}</Text>
        <Text style={line}>{heroNote}</Text>
      </View>

      {sharePercent === null ? null : (
        <View testID="grow-debts-line" style={card}>
          <Text style={{ ...textRole(pairing, 'body'), color: colors.ink }}>
            {month.rule === null
              ? t('grow.debts.lineCardNoRule', { percent: sharePercent })
              : t('grow.debts.lineCard', { percent: sharePercent, rule: Number(month.rule) })}
          </Text>
          <ProgressBar
            percent={Math.min(100, sharePercent)}
            variant="thin"
            tone={over ? 'ink' : 'accent'}
            animate={false}
            tickPercent={month.rule === null || lineModel === null ? undefined : lineModel.line}
            accessibilityLabel={t('grow.debts.lineCardNoRule', { percent: sharePercent })}
          />
          {over ? <StateBadge tone="warn" shape="sOver" label={t('grow.debts.add.overBadge')} /> : null}
        </View>
      )}

      <Text accessibilityRole="header" style={{ ...textRole(pairing, 'sheetTitle'), color: colors.ink }}>
        {t('grow.debts.section')}
      </Text>
      <View style={card}>{model.debts.map((d) => row(d, false))}</View>

      {model.paidInFull.length > 0 ? (
        <>
          <Text accessibilityRole="header" style={{ ...textRole(pairing, 'sheetTitle'), color: colors.ink }}>
            {t('grow.debts.paidInFullSection')}
          </Text>
          <View style={card}>{model.paidInFull.map((d) => row(d, true))}</View>
        </>
      ) : null}

      <PayoffPlanCard
        model={model}
        whatIf={whatIf}
        currency={currency}
        today={today}
        extra={extra}
        lump={DEFAULT_LUMP}
        onExtra={setExtra}
        order={order}
        onOrder={setOrder}
        scenario={scenario}
        onScenario={setScenario}
        left={month.left}
        fmt={fmt}
        onUseExtra={useExtra}
      />

      <Pill label={t('grow.debts.emptyAction')} variant="secondary" onPress={onAdd} />
      <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkMuted }}>{t('grow.debts.footer')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: space.groupGap },
  card: { borderWidth: 1, borderRadius: radii.card, padding: space.cardPadLg, gap: space.gapSm },
  center: { alignItems: 'center' },
  block: { borderRadius: radii.card },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.gapMd, minHeight: 64 },
  tile: { width: 36, height: 36, borderRadius: radii.glyphTile, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  flex: { flex: 1, gap: 2, alignItems: 'flex-start' },
});
