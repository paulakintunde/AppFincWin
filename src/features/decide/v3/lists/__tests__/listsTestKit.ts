// 05.3-36: shared test doubles for the saved-plan and past-decisions lists.
import type { DecideCheckRow } from '@/db/decideChecks';
import type { Evaluation } from '@/engine/decide/v3';

const dollars = (minor: number): string => `${minor < 0 ? '-' : ''}$${Math.abs(Math.round(minor / 100)).toLocaleString('en-US')}`;

/** A stand-in for useV3Format: same shapes, no data hooks. */
export const fakeFormat = {
  money: dollars,
  moneyA11y: dollars,
  month: (ym: string) => ({ '2027-02': 'February', '2026-12': 'December' })[ym] ?? ym,
  monthYear: (ym: string) => ym,
  date: (iso: string) => iso,
  params: () => ({ screen: {}, a11y: {} }),
  flat: () => ({ screen: {}, a11y: {} }),
};

export const LONG = 'A very long item name for the new kitchen renovation that must wrap onto several lines';

export const NOT_YET = { v: 3, code: 'not_yet', variant: 'not_covered', readyBy: { kind: 'month', month: '2027-02' }, unspentAfter: null, lineFacts: [] };
export const FITS = { v: 3, code: 'fits_month', variant: null, readyBy: null, unspentAfter: null, lineFacts: [] };

export const liveEval = (code: string, variant: string | null, readyBy: unknown = null, whole = 120000): Evaluation =>
  ({ result: { code, variant, readyBy, facts: [] }, purchase: { whole } }) as unknown as Evaluation;

export const checkRow = (over: Record<string, unknown> = {}): DecideCheckRow =>
  ({
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Laptop',
    status: 'waiting',
    answer_v3: NOT_YET,
    decided_at: '2026-10-20T10:00:00Z',
    updated_at: '2026-10-20T10:00:00Z',
    deleted_at: null,
    ...over,
  }) as unknown as DecideCheckRow;
