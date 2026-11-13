/**
 * 06.1-22 (D53, D01c): "Something changed?". A home row opens the sheet; the sheet is user-led: it suggests nothing, nothing is
 * pre-selected and nothing is written until "Save what changed". A saved change writes one decide_changes row with one Undo, and
 * shows on home as a "Changed: ... · Reset" chip while it is in force; Reset removes it, also with Undo.
 * 06.1-58 (A-SH-3): each choice sits in a grouped card with the accent tint on the chosen row; the home row has a chevron, since it
 * opens the sheet. Still user-led: nothing is chosen for the person and nothing is written before Save.
 */
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useAddChange, useRemoveChange } from '@/data/mutations/decideChanges';
import { useDecideChanges } from '@/data/queries/decide';
import { useDecideV3 } from '@/data/queries/decideV3';
import { useRecurringSeries } from '@/data/queries/recurringSeries';
import type { DecideChangeRow } from '@/db/decideChanges';
import { useRecordContext } from '@/features/record/useRecordContext';
import { DateField } from '@/features/record/entry/pickers/DateField';
import { useT } from '@/i18n';
import { showToast } from '@/state/undoToast';
import { radii, space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { fontSize, textRole } from '@/theme/typography';
import { hapticLight, hapticSelection } from '@/ui/haptics';
import { useMoneyFormatter } from '@/ui/money/useMoneyFormatter';
import { MoneyInput } from '@/ui/MoneyInput';
import { Pill } from '@/ui/Pill';
import { Sheet, SheetScroll } from '@/ui/Sheet';
import { SheetHeader } from '@/ui/SheetHeader';
import { Text } from '@/ui/Text';
import { StateGlyph } from '@/ui/glyphs/StateGlyph';
import { OptionCard, OptionRow } from './OptionCard';
import { changeRowOf, isActiveChange, leftWithChange, type ChangeEntry } from './homeCardsModel';

export interface BillChoice {
  id: string;
  name: string;
  /** A month's amount, positive minor units. */
  amount: number;
}

const CHEV = 16;

type Kind = 'pay' | 'bill' | 'oneOff';

export interface SomethingChangedSheetProps {
  visible: boolean;
  bills: readonly BillChoice[];
  currency: string;
  today: string;
  /** What a usual month leaves and what pay it counts, for the polite line; null hides the line. */
  usualLeft: number | null;
  usualPay: number | null;
  formatMoney: (minor: number) => string;
  formatDate: (date: string) => string;
  onSave: (entry: ChangeEntry) => void;
  onDismiss: () => void;
}

export function SomethingChangedSheet(props: SomethingChangedSheetProps) {
  return props.visible ? <ChangedForm {...props} /> : null;
}

function ChangedForm({ bills, currency, today, usualLeft, usualPay, formatMoney, formatDate, onSave, onDismiss }: SomethingChangedSheetProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const [kind, setKind] = useState<Kind | null>(null);
  const [amount, setAmount] = useState<number | null>(null);
  const [billId, setBillId] = useState<string | null>(null);
  const [status, setStatus] = useState<'stopped' | 'paused'>('stopped');
  const [date, setDate] = useState(today);
  const small = { ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkMuted };
  const bill = bills.find((b) => b.id === billId) ?? null;

  const entry: ChangeEntry | null =
    kind === 'pay' && amount !== null && amount > 0
      ? { kind: 'pay', amount, from: date }
      : kind === 'bill' && bill !== null
        ? { kind: 'bill', seriesId: bill.id, name: bill.name, amount: bill.amount, status, from: date }
        : kind === 'oneOff' && amount !== null && amount > 0
          ? { kind: 'oneOff', amount, date }
          : null;

  const left = entry === null ? null : leftWithChange(entry, usualLeft, usualPay);
  const live =
    left === null ? '' : left >= 0 ? t('decide.screens.sheetsHome.changed.result', { left: formatMoney(left) }) : t('decide.screens.sheetsHome.changed.resultShort', { short: formatMoney(-left) });

  const options: { key: Kind; title: string; sub: string }[] = [
    { key: 'pay', title: t('decide.screens.sheetsHome.changed.pay'), sub: t('decide.screens.sheetsHome.changed.paySub') },
    { key: 'bill', title: t('decide.screens.sheetsHome.changed.bill'), sub: t('decide.screens.sheetsHome.changed.billSub') },
    { key: 'oneOff', title: t('decide.screens.sheetsHome.changed.oneOff'), sub: t('decide.screens.sheetsHome.changed.oneOffSub') },
  ];
  const title = t('decide.screens.sheetsHome.changed.title');

  return (
    <Sheet visible onDismiss={onDismiss} accessibilityLabel={title} dirty={kind !== null}>
      <SheetHeader title={title} cancelLabel={t('decide.screens.sheetsHome.rule.close')} onCancel={onDismiss} />
      <SheetScroll contentContainerStyle={styles.column}>
        <Text style={small}>{t('decide.screens.sheetsHome.changed.sub')}</Text>
        <Text style={small}>{t('decide.screens.sheetsHome.changed.userLed')}</Text>
        <OptionCard label={t('decide.screens.sheetsHome.changed.whatQ')} testID="changed-kinds">
          {options.map((o, i) => (
            <OptionRow
              key={o.key}
              testID={`changed-kind-${o.key}`}
              first={i === 0}
              title={o.title}
              sub={o.sub}
              selected={kind === o.key}
              onPress={() => {
                hapticSelection();
                setKind(o.key);
              }}
            />
          ))}
        </OptionCard>

        {kind === 'pay' || kind === 'oneOff' ? (
          <MoneyInput
            value={amount}
            currency={currency}
            onChange={setAmount}
            label={t(kind === 'pay' ? 'decide.screens.sheetsHome.changed.newAmount' : 'decide.screens.common.amount')}
            accessibilityLabel={t(kind === 'pay' ? 'decide.screens.sheetsHome.changed.newAmount' : 'decide.screens.common.amount')}
            boxed
          />
        ) : null}

        {kind === 'bill' ? (
          bills.length === 0 ? (
            <Text style={small}>{t('decide.screens.sheetsHome.changed.noBills')}</Text>
          ) : (
            <>
              <Text style={small}>{t('decide.screens.sheetsHome.changed.whichBill')}</Text>
              <OptionCard label={t('decide.screens.sheetsHome.changed.whichBill')} testID="changed-bills">
                {bills.map((b, i) => (
                  <OptionRow
                    key={b.id}
                    testID={`changed-bill-${b.id}`}
                    first={i === 0}
                    title={b.name}
                    right={formatMoney(b.amount)}
                    accessibilityLabel={`${b.name}, ${formatMoney(b.amount)}`}
                    selected={billId === b.id}
                    onPress={() => setBillId(b.id)}
                  />
                ))}
              </OptionCard>
              <Text style={small}>{t('decide.screens.sheetsHome.changed.statusQ')}</Text>
              <OptionCard label={t('decide.screens.sheetsHome.changed.statusQ')}>
                {(['stopped', 'paused'] as const).map((s, i) => (
                  <OptionRow
                    key={s}
                    first={i === 0}
                    title={t(`decide.screens.sheetsHome.changed.${s}`)}
                    selected={status === s}
                    onPress={() => setStatus(s)}
                  />
                ))}
              </OptionCard>
            </>
          )
        ) : null}

        {kind !== null && !(kind === 'bill' && bills.length === 0) ? (
          <DateField
            label={t(kind === 'oneOff' ? 'decide.screens.sheetsHome.changed.date' : 'decide.screens.sheetsHome.changed.from')}
            value={date}
            display={formatDate(date)}
            onChange={setDate}
          />
        ) : null}

        <View accessibilityLiveRegion="polite">{live === '' ? null : <Text style={{ ...textRole(pairing, 'body'), color: colors.ink }}>{live}</Text>}</View>
        <Pill label={t('decide.screens.sheetsHome.changed.save')} variant="primary" disabled={entry === null} onPress={() => (entry === null ? undefined : onSave(entry))} />
      </SheetScroll>
    </Sheet>
  );
}

// ── the chip ──────────────────────────────────────────────────────────────────────────────────────────────────────

export function ChangedChips({ changes, onReset }: { changes: readonly { id: string; text: string }[]; onReset: (id: string) => void }) {
  const t = useT();
  const { colors, pairing } = useTheme();
  if (changes.length === 0) return null;
  return (
    <View style={styles.chips}>
      {changes.map((c) => (
        <Pressable
          key={c.id}
          testID={`changed-chip-${c.id}`}
          accessibilityRole="button"
          accessibilityLabel={t('decide.screens.home.changedChipResetA11y', { change: c.text })}
          onPress={() => onReset(c.id)}
          style={[styles.chip, { backgroundColor: colors.fill1 }]}
        >
          <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.ink }}>{t('decide.screens.home.changedChip', { change: c.text })}</Text>
        </Pressable>
      ))}
    </View>
  );
}

// ── the home piece ────────────────────────────────────────────────────────────────────────────────────────────────

export function SomethingChanged() {
  const t = useT();
  const { colors, pairing } = useTheme();
  const rc = useRecordContext();
  const fmt = useMoneyFormatter(false);
  const money = (n: number) => fmt.formatMoney({ amount: n as never, currency: rc.homeCurrency as never });
  const rows = useDecideChanges(rc.userId ?? undefined, rc.householdId ?? undefined).data;
  const series = useRecurringSeries(rc.householdId ?? undefined).data;
  const v3 = useDecideV3();
  const { add } = useAddChange();
  const { remove } = useRemoveChange();
  const [open, setOpen] = useState(false);

  const thisMonth = rc.today.slice(0, 7);
  const active = useMemo<DecideChangeRow[]>(() => (rows ?? []).filter((r) => isActiveChange(r, thisMonth)), [rows, thisMonth]);
  const bills = useMemo<BillChoice[]>(
    () =>
      (series ?? [])
        .filter((s) => s.deleted_at === null && s.amount < 0 && s.freq === 'monthly' && (s.end_date === null || s.end_date >= rc.today) && s.counts_as == null && !s.goal_id)
        .map((s) => ({ id: s.id, name: s.name, amount: Math.abs(s.amount) })),
    [series, rc.today],
  );
  const month = v3.evaluation?.month ?? null;
  const usualLeft = month?.typicalLeft ?? null;
  const usualPay = month?.typicalIncome ?? null;

  const label = (e: ChangeEntry): string =>
    e.kind === 'pay'
      ? t('decide.screens.sheetsHome.changed.chipPay', { amount: money(e.amount) })
      : e.kind === 'bill'
        ? t(e.status === 'stopped' ? 'decide.screens.sheetsHome.changed.chipStopped' : 'decide.screens.sheetsHome.changed.chipPaused', { bill: e.name })
        : t('decide.screens.sheetsHome.changed.chipOneOff', { amount: money(e.amount) });

  const save = (entry: ChangeEntry) => {
    if (rc.userId === null || rc.householdId === null) return;
    const name = label(entry);
    const draft = changeRowOf(entry, name, usualPay);
    const { stepId } = add({
      householdId: rc.householdId,
      ownerId: rc.userId,
      change: { kind: draft.kind, name: draft.name, monthly_amount: draft.monthly_amount, currency: rc.homeCurrency, start_month: draft.start_month, end_month: draft.end_month },
    });
    hapticLight();
    showToast({
      kind: 'ordinary',
      text: { key: 'decide.screens.sheetsHome.changed.toast', params: { change: name, date: fmt.formatDate(entry.kind === 'oneOff' ? entry.date : entry.from) } },
      stepId,
    });
    setOpen(false);
  };

  const reset = (id: string) => {
    const row = active.find((r) => r.id === id);
    if (row === undefined) return;
    const stepId = remove(row);
    hapticLight();
    showToast({ kind: 'ordinary', text: { key: 'decide.screens.sheetsHome.changed.resetToast' }, stepId });
  };

  return (
    <View style={styles.column}>
      <ChangedChips
        changes={active.map((r) => ({ id: r.id, text: r.name ?? money(Math.abs(r.monthly_amount)) }))}
        onReset={reset}
      />
      <Pressable
        testID="something-changed-row"
        accessibilityRole="button"
        accessibilityLabel={`${t('decide.screens.sheetsHome.rulesCard.changedRow')}. ${t('decide.screens.sheetsHome.rulesCard.changedSub')}`}
        onPress={() => {
          hapticSelection();
          setOpen(true);
        }}
        style={({ pressed }) => [styles.homeRow, { backgroundColor: pressed ? colors.fill6 : colors.surface }]}
      >
        <View style={styles.grow}>
          <Text style={{ ...textRole(pairing, 'body'), fontWeight: '500', color: colors.ink }}>{t('decide.screens.sheetsHome.rulesCard.changedRow')}</Text>
          <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkMuted }}>{t('decide.screens.sheetsHome.rulesCard.changedSub')}</Text>
        </View>
        <StateGlyph name="chev" color={colors.inkFaint} size={CHEV} />
      </Pressable>
      <SomethingChangedSheet
        visible={open}
        bills={bills}
        currency={rc.homeCurrency}
        today={rc.today}
        usualLeft={usualLeft}
        usualPay={usualPay}
        formatMoney={money}
        formatDate={(d) => fmt.formatDate(d)}
        onSave={save}
        onDismiss={() => setOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  column: { gap: space.gapSm, paddingBottom: space.gapSm },
  grow: { flexShrink: 1, flexGrow: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.gapSm },
  chip: { minHeight: space.touchMin, borderRadius: radii.pill, paddingHorizontal: space.gapMd, justifyContent: 'center' },
  homeRow: { minHeight: 52, borderRadius: radii.card, paddingHorizontal: space.cardPad, paddingVertical: space.gapSm, flexDirection: 'row', alignItems: 'center', gap: space.gapMd },
});
