// 06.1-20 (D56, UX-43, UX-30): "Month by month". The recorded months come from pastMonthBars (useMonthPicture().bars); the months ahead
// come from the Evaluation's afterBuy (this month with the purchase, then a usual month once payments start) or, for the saving
// variant, from Futures.buyLater.monthlyAmount. One kind of figure only: what is left each month. A month below zero grows downward
// and reads "short" in words.
import React from 'react';
import type { AfterBuy, Futures, MonthBar } from '@/engine/decide/v3';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { textRole } from '@/theme/typography';
import { Text } from '@/ui/Text';
import { DetailShell, SignedBars, useDetailFormat, type BarItem } from './detailKit';

/** The most recorded months drawn next to the months ahead. */
export const PAST_MONTHS_SHOWN = 6;
/** The most saving months drawn for the saving variant. */
export const SAVING_MONTHS_SHOWN = 6;

export interface AheadMonth {
  key: string;
  /** 'YYYY-MM' for a named month, or null when the row is labelled by `kind`. */
  month: string | null;
  kind: 'month' | 'usual' | 'saving';
  n?: number;
  left: number;
}

/** The months ahead, from the engine's own figures. Saving: the spare money put aside each month until it is ready. */
export function aheadMonths(afterBuy: AfterBuy | null, futures: Futures | null, saving: boolean): AheadMonth[] {
  if (saving) {
    const later = futures?.buyLater;
    if (later === undefined || later.monthlyAmount === null || later.months === null || later.months < 1) return [];
    const count = Math.min(later.months, SAVING_MONTHS_SHOWN);
    return Array.from({ length: count }, (_, i) => ({ key: `s${i + 1}`, month: null, kind: 'saving' as const, n: i + 1, left: later.monthlyAmount as number }));
  }
  if (afterBuy === null) return [];
  const out: AheadMonth[] = [{ key: 'now', month: afterBuy.monthName, kind: 'month', left: afterBuy.month }];
  if (afterBuy.usualMonth !== null) out.push({ key: 'usual', month: null, kind: 'usual', left: afterBuy.usualMonth });
  return out;
}

export interface MonthByMonthSheetProps {
  /** pastMonthBars(prepared), oldest first. */
  bars: readonly MonthBar[];
  ahead: readonly AheadMonth[];
  saving?: boolean;
  currency: string;
  onClose: () => void;
}

export function MonthByMonthSheet({ bars, ahead, saving = false, currency, onClose }: MonthByMonthSheetProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const f = useDetailFormat(currency);
  const k = (key: string, values?: Record<string, string | number>): string => String(t(`decide.screens.answerDetail.monthByMonth.${key}` as never, values as never));
  const past: BarItem[] = saving ? [] : bars.slice(-PAST_MONTHS_SHOWN).map((b) => ({ key: `p${b.month}`, label: f.month(b.month), value: b.left }));
  const next: BarItem[] = ahead.map((a) => ({
    key: a.key,
    label: a.kind === 'month' ? f.month(a.month as string) : a.kind === 'usual' ? k('usualAfter') : k('savedMonth', { n: a.n ?? 0 }),
    value: a.left,
  }));
  const items = [...past, ...next];
  return (
    <DetailShell title={k('title')} sub={saving ? k('subSaving') : k('sub')} footer={t('legal.decideAnswer.footer')} onClose={onClose}>
      {items.length === 0 ? (
        <Text testID="monthbymonth-none" style={{ ...textRole(pairing, 'body'), color: colors.inkDim }}>
          {k('none')}
        </Text>
      ) : (
        <SignedBars items={items} currency={currency} chartLabel={k('chartA11y')} testID="monthbymonth" />
      )}
    </DetailShell>
  );
}
