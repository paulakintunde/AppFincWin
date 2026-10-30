/**
 * 05.3-43 criterion 1: one answer across surfaces. For the same stored check, the code the home list row receives (useChecksV3),
 * the code the Answer screen shows (useCheckV3 into the hero) and useCheckV3's own code are equal. The read layer is faked at the
 * query hooks (as in decideCheckV3.test), so the real hooks, the real compute and the real hero run.
 */
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react-native';
import type { DecideCheckRow } from '@/db/decideChecks';
import { EMPTY_DECIDE_SETTINGS } from '@/db/decideSettings';
import en from '@/i18n/locales/en';
import { useCheckV3, useChecksV3 } from '@/data/queries/decideCheckV3';
import { heroModel } from '../model/hero';
import { savedPlanRow } from '../model/savedPlanRow';

jest.setTimeout(60000);

const WAITING = '11111111-1111-4111-8111-111111111111';
const OPEN = '22222222-2222-4222-8222-222222222222';
const COVER = '33333333-3333-4333-8333-333333333333';
type Q = { data: unknown; isError: boolean; refetch: jest.Mock };
const q = (data: unknown): Q => ({ data, isError: false, refetch: jest.fn() });

const mockSettings = { ...EMPTY_DECIDE_SETTINGS, user_id: 'u1', income_types: ['salary_or_wages'], income_pattern: 'steady' as const, income_pattern_confirmed: true };
const stored = { v: 3 as const, code: 'not_yet' as const, variant: 'not_covered' as const, readyBy: null, unspentAfter: null, lineFacts: [] };
const row = (id: string, over: Partial<DecideCheckRow> = {}): DecideCheckRow =>
  ({ id, household_id: 'h1', created_by: 'u1', kind: 'buy', name: id, inputs: { price: 80000, currency: 'GBP' }, status: 'open', deleted_at: null, answer_v3: null, ...over }) as unknown as DecideCheckRow;
const cover = { kind: 'volatile_cover', key: COVER, amount: null, bool_value: true, on_date: null, check_id: COVER };

const mockState = {
  checks: q([row(WAITING, { status: 'waiting', answer_v3: stored, decided_at: '2026-10-01T10:00:00Z' }), row(OPEN), row(COVER)]),
  answers: q([cover]),
};
jest.mock('@/data/queries/decide', () => ({
  useDecideSnapshot: () => ({ status: 'ready', source: jest.requireActual('@/features/decide/__tests__/helpers/demoScenario').demoSource('2026-10-03'), result: null, retry: jest.fn() }),
  useDecideSettings: () => ({ data: mockSettings, isError: false, refetch: jest.fn() }),
  useDecideChecks: () => mockState.checks,
  useDecideLinks: () => ({ data: [], isError: false, refetch: jest.fn() }),
}));
jest.mock('@/data/queries/decideAnswers', () => ({ useDecideAnswers: () => mockState.answers }));
jest.mock('@/data/queries/recurringDismissals', () => ({ useRecurringDismissals: () => ({ data: [], isError: false, refetch: jest.fn() }) }));
jest.mock('@/features/record/useRecordContext', () => ({ useRecordContext: () => ({ userId: 'u1', householdId: 'h1' }) }));

let client: QueryClient;
const wrapper = ({ children }: { children: React.ReactNode }): React.JSX.Element => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
beforeEach(() => {
  client = new QueryClient();
});

function chipText(key: string): string {
  let node: unknown = en;
  for (const part of key.split('.')) node = (node as Record<string, unknown>)[part];
  return node as string;
}

describe('criterion 1: one code from home, the Answer screen and useCheckV3', () => {
  for (const [label, id] of [
    ['a waiting check', WAITING],
    ['an open draft', OPEN],
    ['a check carrying a volatile-cover answer', COVER],
  ] as const) {
    it(`${label}`, async () => {
      const many = (await renderHook(() => useChecksV3(), { wrapper })).result.current;
      const one = (await renderHook(() => useCheckV3(id), { wrapper })).result.current;
      const homeRowCode = many.byId.get(id)!.result.code;
      const heroCode = one.evaluation!.result.code;
      expect(homeRowCode).toBe(heroCode);
      expect(one.evaluation!.result.variant).toBe(many.byId.get(id)!.result.variant);
      // The hero chip for the Answer screen's evaluation is the chip for the home row's evaluation.
      expect(chipText(heroModel(one.evaluation!).chipKey)).toBe(chipText(heroModel(many.byId.get(id)!).chipKey));
      // The saved-plan row model is built from that same live evaluation.
      if (id === WAITING) {
        const model = savedPlanRow({ row: many.rows.find((r) => r.id === id)!, live: many.byId.get(id), refundBetter: false });
        expect(model.kind).not.toBe('unfinished');
        expect(typeof model.changed).toBe('boolean');
      }
    });
  }
});
