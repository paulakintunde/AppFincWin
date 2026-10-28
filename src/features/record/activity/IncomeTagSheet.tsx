// 05.2-30 (DSU-15, D-21, owner decision 4): "What is this income?". Asked once for a new payer, and reachable again as a
// manual retag. Save writes this payment, the payer rule (with "Apply to future payments" on) and every earlier untagged
// payment from that payer as ONE batch with ONE Undo (plan 16's useTagIncome). The count of earlier payments is shown
// before Save, so nothing is changed without being told. The form mounts per opening so every field starts empty.
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { fetchTransactionsSearch } from '@/db/transactions';
import type { TransactionRow } from '@/db/rows';
import { money } from '@/engine/money';
import { queryKeys } from '@/data/keys';
import { useTagIncome } from '@/data/mutations/incomeTags';
import { earlierUntagged, payerKeyOf } from '@/data/mutations/incomeTagModel';
import { SegmentedToggle } from '@/features/decide/ui/SegmentedToggle';
import { useRecordContext } from '@/features/record/useRecordContext';
import { useT } from '@/i18n';
import { supabase } from '@/services/supabase';
import { showToast } from '@/state/undoToast';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/layout';
import { fontSize, textRole } from '@/theme/typography';
import { Chip } from '@/ui/Chip';
import { hapticSelection } from '@/ui/haptics';
import type { MoneyFormatter } from '@/ui/money/useMoneyFormatter';
import { Pill } from '@/ui/Pill';
import { Sheet, SheetScroll } from '@/ui/Sheet';
import { SheetHeader } from '@/ui/SheetHeader';
import { Text } from '@/ui/Text';
import { ToggleRow } from '@/ui/ToggleRow';
import { INCOME_KINDS } from './IncomeTagChip';

export interface IncomeTagSheetProps {
  visible: boolean;
  /** The money-in payment being tagged. */
  tx: TransactionRow | null;
  /** True when this is the once-only question for a new payer (shows the eyebrow); false for a manual retag. */
  newPayer: boolean;
  formatter: MoneyFormatter;
  onClose: () => void;
  /** "It’s a refund of a purchase": closes this sheet and opens the refund picker for the same payment. */
  onRefundLink?: (tx: TransactionRow) => void;
}

type Counts = 'available' | 'kept';

export function IncomeTagSheet(props: IncomeTagSheetProps) {
  return props.visible && props.tx !== null ? <IncomeTagForm {...props} tx={props.tx} /> : null;
}

function IncomeTagForm({ tx, newPayer, formatter, onClose, onRefundLink }: IncomeTagSheetProps & { tx: TransactionRow }) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const rc = useRecordContext();
  const householdId = rc.householdId ?? '';
  const { tag } = useTagIncome(householdId, rc.userId ?? '');

  const [kind, setKind] = useState<string | null>(null);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [applyToFuture, setApplyToFuture] = useState(true);

  const payer = tx.name ?? '';
  const payerKey = payerKeyOf(tx.name);
  // Earlier payments from this payer, across every month (the search is by name; the model keeps exact payer matches).
  const search = useQuery({
    queryKey: queryKeys.transactionsSearch(householdId, payer),
    queryFn: () => fetchTransactionsSearch(supabase, householdId, payer),
    enabled: householdId !== '' && payerKey !== null && payer.trim().length > 0,
  });
  const earlier = useMemo(
    () => (payerKey === null ? [] : earlierUntagged(search.data ?? [], payerKey, tx.id)),
    [search.data, payerKey, tx.id]
  );

  const canSave = kind !== null && counts !== null;
  const amount = formatter.formatMoney(money(tx.original_amount, tx.original_currency));
  const subline = t('activity.incomeTag.subline', { payer, amount, date: formatter.formatDate(tx.local_date, 'medium') });

  const save = () => {
    if (kind === null || counts === null) return;
    const { stepId, tagged } = tag({ tx, incomeKind: kind, countsAs: counts, applyToFuture, earlier });
    let text: { key: string; params?: Record<string, string | number> };
    if (!applyToFuture) text = { key: 'activity.incomeTag.toastSaved' };
    else if (tagged > 1) text = { key: 'activity.incomeTag.toastTagged', params: { count: tagged, payer } };
    else text = { key: 'activity.incomeTag.toastFuture', params: { payer } };
    showToast({ kind: 'ordinary', text, stepId });
    onClose();
  };

  const title = t('activity.incomeTag.title');
  return (
    <Sheet visible onDismiss={onClose} accessibilityLabel={title}>
      <SheetHeader title={title} cancelLabel={t('record.sheet.cancel')} onCancel={onClose} />
      <SheetScroll contentContainerStyle={styles.column}>
        {newPayer ? (
          <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.eyebrow, color: colors.warn1 }}>
            {t('activity.incomeTag.eyebrow')}
          </Text>
        ) : null}
        <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkMuted }}>{subline}</Text>

        <View accessibilityRole="radiogroup" accessibilityLabel={title} style={styles.chips}>
          {INCOME_KINDS.map((k) => (
            <Chip
              key={k.kind}
              label={t(k.key)}
              selected={kind === k.kind}
              onPress={() => {
                hapticSelection();
                setKind(k.kind);
              }}
            />
          ))}
        </View>

        {onRefundLink !== undefined ? (
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={t('activity.incomeTag.refundLink')}
            onPress={() => onRefundLink(tx)}
            style={styles.link}
          >
            <Text style={{ ...textRole(pairing, 'label'), color: colors.ink, textDecorationLine: 'underline' }}>
              {t('activity.incomeTag.refundLink')}
            </Text>
          </Pressable>
        ) : null}

        <Text style={{ ...textRole(pairing, 'label'), color: colors.ink }}>{t('activity.incomeTag.countsQuestion')}</Text>
        <SegmentedToggle
          accessibilityLabel={t('activity.incomeTag.countsQuestion')}
          value={counts ?? ''}
          onChange={(key) => setCounts(key === 'kept' ? 'kept' : 'available')}
          options={[
            { key: 'available', label: t('activity.incomeTag.countsAvailable') },
            { key: 'kept', label: t('activity.incomeTag.countsKept') },
          ]}
        />

        <ToggleRow
          label={t('activity.incomeTag.applyFuture', { payer })}
          value={applyToFuture}
          onChange={(next) => {
            hapticSelection();
            setApplyToFuture(next);
          }}
        />
        {applyToFuture && earlier.length > 0 ? (
          <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkMuted }}>
            {t('activity.incomeTag.countLine', { count: earlier.length, payer })}
          </Text>
        ) : null}

        <View style={styles.actions}>
          <Pill label={t('activity.incomeTag.save')} variant="primary" disabled={!canSave} onPress={save} />
          <Pill label={t('activity.incomeTag.notNow')} variant="secondary" onPress={onClose} />
        </View>
      </SheetScroll>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  column: { gap: space.gapMd, paddingBottom: space.sheetPadBottom },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.gapSm },
  link: { minHeight: space.touchMin, justifyContent: 'center', alignSelf: 'flex-start' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.gapSm },
});
