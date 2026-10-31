/** 05.3-41 test kit: a full Evaluation and check row for the Answer screen, the copy lookup and the shared format fake. Mocks stay in each test file. */
import type { DecideCheckRow } from '@/db/decideChecks';
import type { Evaluation } from '@/engine/decide/v3';
import en from '@/i18n/locales/en';

export interface FullOver {
  code?: string;
  variant?: string | null;
  readyBy?: unknown;
  facts?: unknown[];
  split?: unknown[];
  notices?: unknown[];
  missing?: string[];
  readiness?: { ready: boolean; missing: string[]; waived?: unknown[] };
  /** 05.3-59: extra MonthModel fields (paidByOther, alwaysOther) */
  month?: Record<string, unknown>;
  cash?: unknown;
  band?: number;
  financed?: boolean;
  schedule?: unknown;
  confidence?: { level: string; reasons: string[] };
}

/** Sam's October: $425 left, $300 typical, a $1,200 sofa. Every field the screen's parts read. */
export function fullEv(o: FullOver = {}): Evaluation {
  const code = o.code ?? 'fits_month';
  return {
    result: {
      code,
      variant: o.variant ?? null,
      legacyState: 'ok',
      split: o.split ?? [{ source: 'month', amount: 120000 }],
      facts: o.facts ?? [{ code: 'month_left_after', values: { month: '2026-10', left: 42500 } }],
      notices: o.notices ?? [],
      missing: o.missing ?? [],
      reasons: [],
      readyBy: o.readyBy ?? null,
      band: o.band ?? 4,
      layers: [],
      confidence: o.confidence ?? { level: 'firm', reasons: [] },
      parts: { oneOff: code, monthly: null },
      ...(o.readiness === undefined ? {} : { readiness: o.readiness }),
    },
    month: { month: '2026-10', daysInMonth: 31, erest: 20000, monthLeft: 42500, typicalLeft: 30000, low: null, unseenPay: [], ...o.month },
    purchase: {
      whole: 120000,
      dayOne: 120000,
      monthly: 0,
      runningMonthly: 0,
      schedule: o.schedule ?? null,
      band: o.band ?? 4,
      financed: o.financed ?? false,
      layers: [],
      categoryId: null,
    },
    cash: o.cash ?? { kind: 'ok' },
    planCard: null,
    quoted: { kind: 'none' },
  } as unknown as Evaluation;
}

export function storedOf(code: string, variant: string | null = null) {
  return { v: 3, code, variant, readyBy: null, unspentAfter: null, lineFacts: [] };
}

export function rowOf(over: Partial<Record<keyof DecideCheckRow, unknown>> = {}): DecideCheckRow {
  return {
    id: 'c1',
    household_id: 'h1',
    created_by: 'u1',
    kind: 'buy',
    name: 'Sofa',
    inputs: {},
    status: 'open',
    answer_v3: null,
    decided_at: null,
    updated_at: '2026-10-12T09:00:00Z',
    deleted_at: null,
    ...over,
  } as unknown as DecideCheckRow;
}

/** The English string at a dotted catalogue key. */
export function copy(key: string): string {
  let node: unknown = en;
  for (const part of key.split('.')) node = (node as Record<string, unknown>)[part];
  if (typeof node !== 'string') throw new Error(`no copy at ${key}`);
  return node;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const money = (n: number): string => '$' + (n / 100).toLocaleString('en-US');
const dateText = (iso: string): string => `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]}`;

type Param = { kind: 'money'; minor: number } | { kind: 'month'; ym: string } | { kind: 'date'; iso: string } | { kind: 'count'; n: number };
const paramText = (v: Param): string => (v.kind === 'money' ? money(v.minor) : v.kind === 'month' ? v.ym : v.kind === 'date' ? dateText(v.iso) : String(v.n));

export const fakeFormat = {
  money,
  moneyA11y: money,
  month: (ym: string) => ym,
  monthYear: (ym: string) => ym,
  date: dateText,
  params: (p: Record<string, Param>) => {
    const screen = Object.fromEntries(Object.entries(p).map(([k, v]) => [k, paramText(v)]));
    return { screen, a11y: screen };
  },
  flat: (p: Record<string, string | number>) => {
    const screen = Object.fromEntries(Object.entries(p).map(([k, v]) => [k, String(v)]));
    return { screen, a11y: screen };
  },
};

export const SCREEN_INPUTS = { months: [{ full: true }] };

/** 05.3-59: the user's answers fixtures. Netflix paid by someone else on 3 Oct, Lunch paid by someone else in September. */
export const PBO_NETFLIX = { seriesId: 'netflix', name: 'Netflix', date: '2026-10-03', amount: 1199, by: 'paid_by_other' };
export const WAIVED_LUNCH = {
  item: { kind: 'bill', code: 'past_month_missing', month: '2026-09', seriesId: 'lunch', envelopeId: null, lineId: null, name: 'Lunch', amount: 1000, date: '2026-09-21' },
  by: 'paid_by_other',
  waiver: { kind: 'paid_by_other', seriesId: 'lunch', date: '2026-09-21' },
};
export const READY_WITH = (waived: unknown[]) => ({ ready: true, missing: [], waived });
