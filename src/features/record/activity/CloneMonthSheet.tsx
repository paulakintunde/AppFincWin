// REC-19 (CONTEXT D-13, D-14; UI-SPEC 6): clone last month's one-off lines into the target
// month as pending lines. Candidates come from the engine; every one starts ticked and the
// ticked ones are cloned as a single undo step.
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useMonthView } from '@/data/queries/activity';
import { useCloneMonth } from '@/data/mutations/cloneMonth';
import { cloneCandidates, type CloneSourceRow } from '@/engine/recurring';
import { money } from '@/engine/money';
import { useRecordContext } from '@/features/record/useRecordContext';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/layout';
import { textRole } from '@/theme/typography';
import { useMoneyFormatter } from '@/ui/money/useMoneyFormatter';
import { Pill } from '@/ui/Pill';
import { Sheet, SheetScroll } from '@/ui/Sheet';
import { SheetHeader } from '@/ui/SheetHeader';
import { formatMonthLabel } from './MonthSwitcher';

export interface CloneMonthSheetProps {
  visible: boolean;
  targetMonth: string;
  onClose: () => void;
}

/** The month before `month` ('YYYY-MM'). */
export function previousMonth(month: string): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}

export function CloneMonthSheet({ visible, targetMonth, onClose }: CloneMonthSheetProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const ctx = useRecordContext();
  const formatter = useMoneyFormatter(ctx.showCents);
  const { clone } = useCloneMonth();
  const prevMonth = previousMonth(targetMonth);
  const prev = useMonthView(ctx, prevMonth);
  const current = useMonthView(ctx, targetMonth);

  const candidates = useMemo(
    () =>
      cloneCandidates({
        prevRows: prev.rows.map(
          (r): CloneSourceRow => ({
            id: r.id,
            local_date: r.local_date,
            name: r.name,
            original_amount: r.original_amount,
            original_currency: r.original_currency,
            category_id: r.category_id,
            account_id: r.account_id,
            payment_type: r.payment_type,
            recurring_series_id: r.recurring_series_id,
            transfer_id: r.transfer_id,
            status: r.status,
            is_refund: r.is_refund,
          })
        ),
        currentRows: current.rows,
        targetMonth,
      }),
    [prev.rows, current.rows, targetMonth]
  );

  const [unticked, setUnticked] = useState<ReadonlySet<string>>(new Set());
  const close = () => {
    setUnticked(new Set());
    onClose();
  };

  const ticked = candidates.filter((c) => !unticked.has(c.sourceId));
  const prevLabel = formatMonthLabel(prevMonth, formatter.locale);

  const toggle = (id: string) =>
    setUnticked((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const submit = () => {
    if (ticked.length === 0 || ctx.householdId === null || ctx.userId === null) return;
    clone({
      candidates: ticked,
      householdId: ctx.householdId,
      ownerId: ctx.userId,
      homeCurrency: ctx.homeCurrency,
      timeZone: ctx.timeZone,
      month: targetMonth,
    });
    close();
  };

  const bodyStyle = { ...textRole(pairing, 'body'), color: colors.inkMuted };
  const nameStyle = { ...textRole(pairing, 'body'), color: colors.ink };
  const metaStyle = { ...textRole(pairing, 'label'), color: colors.inkMuted };

  return (
    <Sheet visible={visible} onDismiss={close} accessibilityLabel={t('activity.clone.title', { month: prevLabel })}>
      <SheetHeader
        title={t('activity.clone.title', { month: prevLabel })}
        cancelLabel={t('record.sheet.cancel')}
        onCancel={close}
      />
      <Text style={bodyStyle}>
        {candidates.length === 0
          ? t('activity.clone.none', { month: prevLabel })
          : t('activity.clone.body', { month: prevLabel })}
      </Text>
      <SheetScroll>
        {candidates.map((c) => {
          const on = !unticked.has(c.sourceId);
          const name = c.name ?? '';
          return (
            <Pressable
              key={c.sourceId}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              accessibilityLabel={t('activity.clone.tickA11y', { name })}
              onPress={() => toggle(c.sourceId)}
              style={styles.row}
            >
              <View
                style={[
                  styles.box,
                  { borderColor: on ? colors.accent : colors.inkFaint, backgroundColor: on ? colors.accent : 'transparent' },
                ]}
              />
              <View style={styles.text}>
                <Text style={nameStyle}>{name}</Text>
                <Text style={metaStyle}>
                  {t('activity.clone.row', {
                    amount: formatter.formatMoney(money(c.amount, c.currency)),
                    day: Number(c.localDate.slice(8, 10)),
                  })}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </SheetScroll>
      <Pill
        label={t('activity.clone.cta', { count: ticked.length })}
        variant="primary"
        disabled={ticked.length === 0}
        onPress={submit}
      />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.gapSm,
    minHeight: space.touchMin,
  },
  box: { width: 20, height: 20, borderRadius: 4, borderWidth: 2 },
  text: { flex: 1 },
});
