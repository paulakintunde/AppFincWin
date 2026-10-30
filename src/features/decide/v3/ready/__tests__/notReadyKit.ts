/**
 * 05.3-58: fixtures for the asking not-ready card. The owner evidence (asOf 2026-10-30, four items over two months) is
 * copied from 05.3-57's notReadyItems.test.ts; the five-envelope fixture exercises "and N more".
 */
import { minorUnits } from '@/engine/money/types';
import type { Readiness, ReadinessItem } from '@/engine/decide/v3';

export const TODAY = '2026-10-30';

export function item(over: Partial<ReadinessItem>): ReadinessItem {
  return { kind: 'bill', code: 'past_month_missing', month: '2026-09', seriesId: null, envelopeId: null, lineId: null, name: null, amount: null, date: null, ...over };
}

export const PAY = item({ kind: 'pay', seriesId: 'pay', lineId: 'pay-sep', name: 'Income', amount: minorUnits(1619942), date: '2026-09-03' });
export const NETFLIX = item({ seriesId: 'netflix', lineId: 'netflix-sep', name: 'Netflix', amount: minorUnits(1199), date: '2026-09-03' });
export const LUNCH = item({ seriesId: 'lunch', lineId: 'lunch-sep', name: 'Lunch', amount: minorUnits(1000), date: '2026-09-21' });
export const SPENDING = item({ kind: 'spending', code: 'activity_not_current', month: '2026-10', date: '2026-10-14' });

export function readinessOf(items: readonly ReadinessItem[], missing: Readiness['missing'] = ['activity_not_current', 'past_month_missing']): Readiness {
  return { ready: false, missing, items, waived: [] };
}

export const evidence = (): Readiness => readinessOf([PAY, NETFLIX, LUNCH, SPENDING]);

const ENVELOPE_NAMES = ['Holiday fund', 'Car repairs', 'Emergency savings', 'Christmas', 'Wedding'];
export const fiveEnvelopes = (): Readiness =>
  readinessOf(
    ENVELOPE_NAMES.map((name, i) => item({ kind: 'envelopes', code: 'envelopes_unconfirmed', month: '2026-10', envelopeId: `env-${i}`, name })),
    ['envelopes_unconfirmed'],
  );

const MONTHS: Readonly<Record<string, string>> = { '09': 'September', '10': 'October' };
const SHORT: Readonly<Record<string, string>> = { '09': 'Sep', '10': 'Oct' };

function parts(minor: number): { whole: string; cents: string } {
  return { whole: String(Math.trunc(minor / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ','), cents: String(minor % 100).padStart(2, '0') };
}

/** A deterministic stand-in for useV3Format (the real one reads queries that need the Supabase env). */
export const fakeFormat = {
  money: (minor: number) => {
    const p = parts(minor);
    return `$${p.whole}.${p.cents}`;
  },
  moneyA11y: (minor: number) => {
    const p = parts(minor);
    return `${p.whole} dollars and ${Number(p.cents)} cents`;
  },
  month: (ym: string) => MONTHS[ym.slice(5, 7)] ?? ym,
  monthYear: (ym: string) => ym,
  date: (iso: string) => `${Number(iso.slice(8, 10))} ${SHORT[iso.slice(5, 7)] ?? iso.slice(5, 7)}`,
};
