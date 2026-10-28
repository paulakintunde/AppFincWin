// 05.2-33 (DSU-16, D-06..D-10): link a money-in row to the purchase it refunds, or (from a purchase's "+ Link a refund")
// pick the money-in row that refunded it. Nothing links by itself (T-05.2-33-02): the user picks, sees the "What this
// does" tile, and saves. Link and Remove link are queued writes with Undo (plan 16). The list is the cached 12-month
// window, so it works offline. The form mounts per opening so the search and the selection start fresh.
import React, { useMemo, useState } from 'react';
import { PixelRatio, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { fetchWrittenRowLinks } from '@/db/decideLinks';
import type { TransactionRow } from '@/db/rows';
import { fetchTransactionsInRange } from '@/db/transactions';
import { money } from '@/engine/money';
import { queryKeys } from '@/data/keys';
import { useCategoryLookup } from '@/data/queries/categories';
import { useRefundLinks } from '@/data/queries/refundLinks';
import { useLinkRefund, useUnlinkRefund } from '@/data/mutations/refundLinks';
import { refundPreview, type RefundPreview } from '@/data/mutations/refundLinkModel';
import { categoryName } from '@/features/record/categoryName';
import { useRecordContext } from '@/features/record/useRecordContext';
import { useT } from '@/i18n';
import { supabase } from '@/services/supabase';
import { showToast } from '@/state/undoToast';
import { useTheme } from '@/theme/ThemeProvider';
import { PRESSED_OPACITY, radii, space } from '@/theme/layout';
import { fontSize, textRole } from '@/theme/typography';
import { hapticSelection } from '@/ui/haptics';
import type { MoneyFormatter } from '@/ui/money/useMoneyFormatter';
import { Pill } from '@/ui/Pill';
import { RadioDot } from '@/ui/RadioDot';
import { Sheet, SheetScroll } from '@/ui/Sheet';
import { SheetHeader } from '@/ui/SheetHeader';
import { Text } from '@/ui/Text';
import { TextInput } from '@/ui/TextInput';
import {
  monthsBefore,
  PICKER_WINDOW_MONTHS,
  purchaseCandidates,
  refundCandidates,
  type PickerDirection,
} from './refundPickerModel';

export interface RefundPickerSheetProps {
  visible: boolean;
  /** 'refund->purchase': the anchor is the money-in row. 'purchase->refund': the anchor is the purchase. */
  direction: PickerDirection;
  anchor: TransactionRow | null;
  formatter: MoneyFormatter;
  onClose: () => void;
}

export function RefundPickerSheet(props: RefundPickerSheetProps) {
  return props.visible && props.anchor !== null ? <RefundPickerForm {...props} anchor={props.anchor} /> : null;
}

function monthName(month: string, locale: string): string {
  const [y, m] = month.split('-') as [string, string];
  return new Intl.DateTimeFormat(locale, { month: 'long', timeZone: 'UTC' }).format(Date.UTC(Number(y), Number(m) - 1, 1));
}

function RefundPickerForm({ direction, anchor, formatter, onClose }: RefundPickerSheetProps & { anchor: TransactionRow }) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const rc = useRecordContext();
  const householdId = rc.householdId ?? '';
  const userId = rc.userId ?? '';
  const today = rc.today;
  const categories = useCategoryLookup(rc.userId ?? undefined);
  const { link } = useLinkRefund(householdId, userId);
  const { unlink } = useUnlinkRefund(householdId, userId);
  const forward = direction === 'refund->purchase';

  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(forward ? (anchor.refund_of ?? null) : null);

  // Cached window: the 12 months before the refund, or the purchase date up to today.
  const from = forward ? monthsBefore(anchor.local_date, PICKER_WINDOW_MONTHS) : anchor.local_date;
  const to = forward ? anchor.local_date : today;
  const window = useQuery({
    queryKey: queryKeys.refundCandidates(householdId, from, to),
    queryFn: () => fetchTransactionsInRange(supabase, householdId, { from, toInclusive: to }),
    enabled: householdId !== '',
  });
  const windowRows = useMemo(() => window.data ?? [], [window.data]);
  const loadedRows = useMemo(() => [anchor, ...windowRows], [anchor, windowRows]);
  const { rowsById, totals } = useRefundLinks(householdId, loadedRows, true);

  const amountText = (r: TransactionRow): string => formatter.formatMoney(money(Math.abs(r.original_amount), r.original_currency));

  const list = useMemo(() => {
    const input = { anchor, rows: windowRows, today, query, amountText };
    const base = forward ? purchaseCandidates(input) : refundCandidates(input);
    // A purchase already linked stays in the list (selected) even when it is older than the window.
    const linked = forward && anchor.refund_of ? rowsById.get(anchor.refund_of) : undefined;
    return linked !== undefined && !base.some((r) => r.id === linked.id) && linked.deleted_at === null ? [linked, ...base] : base;
    // amountText is rebuilt from the formatter each render; the formatter identity is the real dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchor, windowRows, today, query, forward, rowsById, formatter]);

  const selected = selectedId === null ? null : (list.find((r) => r.id === selectedId) ?? rowsById.get(selectedId) ?? null);
  const purchase = forward ? selected : anchor;
  const refund = forward ? anchor : selected;

  // D-09: a purchase on a payment plan (a recurring series, or a Go ahead purchase written by Decide).
  const written = useQuery({
    queryKey: queryKeys.decideWrittenRowLinks(userId, householdId),
    queryFn: () => fetchWrittenRowLinks(supabase, householdId),
    enabled: householdId !== '' && userId !== '' && purchase !== null,
  });
  const onPlan =
    purchase !== null &&
    (purchase.recurring_series_id !== null || (written.data ?? []).some((l) => l.target_id === purchase.id));

  const title = t(forward ? 'activity.refund.pickerTitle' : 'activity.refund.pickerTitleReverse');
  const subline = t(forward ? 'activity.refund.pickerSubline' : 'activity.refund.pickerSublineReverse', {
    payer: anchor.name ?? '',
    amount: formatter.formatMoney(money(Math.abs(anchor.original_amount), anchor.original_currency)),
    date: formatter.formatDate(anchor.local_date, 'short'),
  });
  const searchLabel = t(forward ? 'activity.refund.search' : 'activity.refund.searchPayments');

  // What the purchase already carries from other refunds (this refund's own link is not counted twice).
  const preview: RefundPreview | null = useMemo(() => {
    if (purchase === null || refund === null) return null;
    const own = refund.refund_of === purchase.id && refund.deleted_at === null ? refund.original_amount : 0;
    return refundPreview({
      price: Math.abs(purchase.original_amount),
      alreadyRefunded: Math.max(0, (totals.get(purchase.id) ?? 0) - own),
      refund: refund.original_amount,
      purchaseDate: purchase.local_date,
      refundDate: refund.local_date,
    });
  }, [purchase, refund, totals]);

  const cur = anchor.original_currency;
  const fmt = (minor: number): string => formatter.formatMoney(money(minor, cur));
  const tile = (p: RefundPreview): string => {
    const loc = formatter.locale;
    switch (p.kind) {
      case 'full':
        return t('activity.refund.whatFull', { purchaseMonth: monthName(p.purchaseMonth, loc), refundMonth: monthName(p.refundMonth, loc) });
      case 'partial':
        return t('activity.refund.whatPartial', { amount: fmt(p.stays), purchaseMonth: monthName(p.purchaseMonth, loc) });
      case 'several':
        return t('activity.refund.whatSeveral', { sum: fmt(p.sum), price: fmt(p.price) });
      case 'over':
        return t('activity.refund.whatOver', { amount: fmt(p.extra), refundMonth: monthName(p.refundMonth, loc) });
    }
  };

  const currentLink = forward ? (anchor.refund_of ?? null) : null;
  const canLink = purchase !== null && refund !== null && !(forward && selectedId === currentLink);

  const doLink = () => {
    if (purchase === null || refund === null) return;
    const { stepId } = link(refund, purchase);
    showToast({ kind: 'ordinary', text: { key: 'activity.refund.toastLinked' }, stepId });
    onClose();
  };
  const doUnlink = () => {
    const { stepId } = unlink(anchor);
    showToast({ kind: 'ordinary', text: { key: 'activity.refund.toastUnlinked' }, stepId });
    onClose();
  };

  const { width } = useWindowDimensions();
  const stacked = width < 360 || PixelRatio.getFontScale() > 1.3;

  return (
    <Sheet visible onDismiss={onClose} accessibilityLabel={title}>
      <SheetHeader title={title} cancelLabel={t('record.sheet.cancel')} onCancel={onClose} />
      <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkMuted, paddingBottom: space.gapSm }}>
        {subline}
      </Text>
      <View style={[styles.field, { backgroundColor: colors.fill1 }]}>
        <TextInput
          accessibilityLabel={searchLabel}
          placeholder={searchLabel}
          placeholderTextColor={colors.inkMuted}
          value={query}
          onChangeText={setQuery}
          autoCorrect={false}
          style={[textRole(pairing, 'body'), styles.input, { color: colors.ink }]}
        />
        {query !== '' ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('activity.refund.clearSearch')}
            onPress={() => setQuery('')}
            style={styles.clear}
          >
            <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>×</Text>
          </Pressable>
        ) : null}
      </View>
      <SheetScroll contentContainerStyle={styles.column}>
        <View accessibilityRole="radiogroup" accessibilityLabel={title} accessibilityState={{ busy: window.isPending }}>
          {list.length === 0 && !window.isPending ? (
            <View style={styles.empty}>
              <Text style={{ ...textRole(pairing, 'sheetTitle'), color: colors.ink }}>
                {t(forward ? 'activity.refund.emptyTitle' : 'activity.refund.emptyTitleReverse')}
              </Text>
              <Text style={{ ...textRole(pairing, 'body'), color: colors.inkMuted }}>{t('activity.refund.emptyBody')}</Text>
            </View>
          ) : (
            list.map((r) => {
              const isSel = r.id === selectedId;
              const cat = r.category_id !== null ? categories.byId.get(r.category_id) : undefined;
              const sub = cat
                ? t('activity.refund.rowSub', { date: formatter.formatDate(r.local_date, 'short'), category: categoryName(cat, t) })
                : t('activity.refund.rowSubNoCategory', { date: formatter.formatDate(r.local_date, 'short') });
              const refundedSoFar = forward
                ? Math.max(0, (totals.get(r.id) ?? 0) - (anchor.refund_of === r.id ? anchor.original_amount : 0))
                : 0;
              const amount = forward ? amountText(r) : `+${amountText(r)}`;
              return (
                <Pressable
                  key={r.id}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: isSel }}
                  accessibilityLabel={[r.name ?? '', sub, amount].filter((p) => p !== '').join(', ')}
                  onPress={() => {
                    hapticSelection();
                    setSelectedId(r.id);
                  }}
                  style={({ pressed }) => [styles.row, { opacity: pressed ? PRESSED_OPACITY : 1 }]}
                >
                  <RadioDot selected={isSel} />
                  <View style={[styles.rowBody, stacked ? styles.rowStacked : styles.rowSide]}>
                    <View style={styles.rowText}>
                      <Text style={{ ...textRole(pairing, 'sheetTitle'), color: colors.ink }}>{r.name ?? ''}</Text>
                      <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkMuted }}>{sub}</Text>
                      {refundedSoFar > 0 ? (
                        <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.warn1 }}>
                          {t('activity.refund.soFar', { amount: fmt(refundedSoFar) })}
                        </Text>
                      ) : null}
                    </View>
                    <Text numberOfLines={1} style={{ ...textRole(pairing, 'body'), color: colors.ink }}>
                      {amount}
                    </Text>
                  </View>
                </Pressable>
              );
            })
          )}
        </View>

        {preview !== null ? (
          <View accessibilityRole="summary" style={[styles.tile, { backgroundColor: colors.fill1 }]}>
            <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.s13_5, color: colors.inkDim }}>{tile(preview)}</Text>
            {onPlan ? (
              <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.s13_5, color: colors.inkDim }}>
                {t('activity.refund.whatPlan')}
              </Text>
            ) : null}
            <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.s13_5, color: colors.inkDim }}>
              {t('activity.refund.footer')}
            </Text>
          </View>
        ) : null}

        <View style={styles.actions}>
          <Pill label={t('activity.refund.link')} variant="primary" disabled={!canLink} onPress={doLink} />
          {forward && currentLink !== null ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('activity.refund.remove')}
              onPress={doUnlink}
              style={({ pressed }) => [styles.remove, { opacity: pressed ? PRESSED_OPACITY : 1 }]}
            >
              <Text style={{ ...textRole(pairing, 'label'), color: colors.danger }}>{t('activity.refund.remove')}</Text>
            </Pressable>
          ) : null}
        </View>
      </SheetScroll>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radii.card / 2,
    minHeight: space.touchMin,
    paddingHorizontal: space.gapMd,
    marginBottom: space.gapSm,
  },
  input: { flex: 1, minHeight: space.touchMin },
  clear: { minWidth: space.touchMin, minHeight: space.touchMin, alignItems: 'center', justifyContent: 'center' },
  column: { gap: space.gapMd, paddingBottom: space.sheetPadBottom },
  row: { minHeight: space.touchMin, flexDirection: 'row', alignItems: 'center', gap: space.gapMd, paddingVertical: space.rowPadDense },
  rowBody: { flex: 1, gap: space.gapSm },
  rowSide: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rowStacked: { flexDirection: 'column', alignItems: 'flex-start' },
  rowText: { flexShrink: 1, gap: 2 },
  empty: { gap: space.gapSm, paddingVertical: space.cardPad },
  tile: { borderRadius: 16, padding: space.cardPad, gap: space.gapSm },
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.gapMd },
  remove: { minHeight: space.touchMin, justifyContent: 'center', paddingHorizontal: space.gapSm },
});
