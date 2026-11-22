// 08.1-23 (owner 2026-11-21 Q11, CMP-F19): the shared build (home, overview, Decide home) counts a joint account the way a Just me check
// does, so "left this month" on Home and a Just me check agree for a person with a joint account. The Decide reads are real hooks on one
// seeded QueryClient; the snapshot and the household source are stand-ins.
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react-native';
import { EMPTY_DECIDE_SETTINGS } from '@/db/decideSettings';
import { judgeCheck, prepare } from '@/engine/decide/v3';
import { checkOnce } from '@/engine/decide/v3/__tests__/helpers/fixtures';
import { monthPicture } from '@/engine/month';
import { demoSource } from '@/features/decide/__tests__/helpers/demoScenario';
import type { SnapshotSource } from '@/features/decide/snapshot/sourceTypes';
import { buildInputs } from '@/features/decide/snapshot/v3/buildInputs';
import type { HouseholdScopeSource } from '@/features/decide/snapshot/v3/householdScope';
import { queryKeys } from '../../keys';
import { useDecideV3, withHouseholdSource, type DecideV3State } from '../decideV3';

jest.mock('@/services/supabase', () => ({ supabase: {} }));
const never = () => new Promise(() => undefined);
jest.mock('@/db/decideChecks', () => ({ fetchDecideChecks: () => never() }));
jest.mock('@/db/decideSettings', () => ({ ...jest.requireActual('@/db/decideSettings'), fetchDecideSettings: () => never() }));
jest.mock('@/db/decideAnswers', () => ({ fetchDecideAnswers: () => never() }));
jest.mock('@/db/recurringDismissals', () => ({ fetchDismissals: () => never() }));
jest.mock('@/db/decideLinks', () => ({ fetchDecideLinks: () => never() }));
jest.mock('@/features/record/useRecordContext', () => ({ useRecordContext: () => ({ userId: 'ali', householdId: 'h1' }) }));

const TODAY = '2026-11-15';
const mockSnap = { status: 'ready' as const, source: null as SnapshotSource | null, result: null, retry: () => undefined, unsavedWrites: 0 };
jest.mock('../decide', () => ({ ...jest.requireActual('../decide'), useDecideSnapshot: () => mockSnap }));
let mockHousehold: HouseholdScopeSource | undefined;
jest.mock('@/features/household/decide/useHouseholdScopeSource', () => ({ useHouseholdScopeSource: () => ({ source: mockHousehold, pending: false }) }));

/** The demo person's first account made joint (everyday use), so their own records hold its whole visible balance. */
function jointSource(): { source: SnapshotSource; jointId: string; balance: number } {
  const base = demoSource(TODAY);
  const first = base.accounts.find((a) => a.kind === 'checking') ?? base.accounts[0]!;
  const accounts = base.accounts.map((a) => (a.id === first.id ? ({ ...a, is_shared: true, use: 'everyday' } as typeof a) : a));
  return { source: { ...base, accounts }, jointId: first.id, balance: base.balances[first.id] ?? 0 };
}

function household(jointId: string, balance: number): HouseholdScopeSource {
  return {
    scope: 'me',
    viewerId: 'ali',
    myWeight: 50,
    partners: [{ key: 'noa', weight: 50, sharing: false, roundedLeft: null, currency: '' }],
    settleUp: null,
    memberKeys: ['ali', 'noa'],
    // the bill split, 50/50: this month's joint money splits evenly, though Ali paid in less of it than Noa
    setting: { rule: 'bill', setup: null, shares: null },
    billWeights: { ali: 1, noa: 1 },
    // the true joint balance: what Ali sees plus what Noa paid in that Ali cannot see
    joint: [{ id: jointId, currency: 'USD', purpose: 'everyday', spendable: false, balance: balance + 200_000, monthIn: 300_000, monthOut: 0, billsDueBeforeNextIn: 0, paidInBy: { ali: 100_000, noa: 200_000 } }],
  };
}

function seed(client: QueryClient): void {
  client.setQueryData(queryKeys.decideSettings('ali'), { ...EMPTY_DECIDE_SETTINGS, user_id: 'ali', income_types: ['salary_or_wages'], income_pattern: 'steady', income_pattern_confirmed: true });
  client.setQueryData(queryKeys.decideAnswers('ali', 'h1'), []);
  client.setQueryData(queryKeys.recurringDismissals('h1'), []);
  client.setQueryData(queryKeys.decideChecks('ali', 'h1'), []);
  client.setQueryData([...queryKeys.decideLinks('ali', 'h1'), ''], []);
}

const seen: DecideV3State[] = [];
function Consumer() {
  seen.push(useDecideV3());
  return null;
}

async function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  seed(client);
  await render(
    <QueryClientProvider client={client}>
      <Consumer />
    </QueryClientProvider>,
  );
  await waitFor(() => expect(seen[seen.length - 1]?.status).toBe('ready'));
  return seen[seen.length - 1]!;
}

const leftOf = (s: DecideV3State): number => Number(monthPicture(s.prepared!).leftAfterPlans);

beforeEach(() => {
  seen.length = 0;
  mockHousehold = undefined;
});

describe('08.1-23 Q11: Home and a Just me check agree for a person with a joint account', () => {
  it('the shared build lays in only my slice of the joint account, as the Just me check build does', async () => {
    const { source, jointId, balance } = jointSource();
    mockSnap.source = source;
    const before = await mount();
    const fullBalance = leftOf(before); // no household source: the joint account counted as Ali sees it, in full
    seen.length = 0;
    mockHousehold = household(jointId, balance);
    const state = await mount();
    // the Just me check build (useCheckEngine): the snapshot with the household source, through buildInputs
    const check = prepare(buildInputs({ ...source, household: mockHousehold }, state.v3 ?? null));
    expect(leftOf(state)).toBe(Number(monthPicture(check).leftAfterPlans));
    expect(state.inputs?.accounts?.find((a) => a.id === jointId)?.balance).toBe(check.inputs.accounts?.find((a) => a.id === jointId)?.balance);
    // and the same answer for a purchase
    const buy = checkOnce(30_000);
    const home = judgeCheck(state.prepared!, buy).result;
    const justMe = judgeCheck(check, buy).result;
    expect([home.code, home.variant, home.afterBuy]).toEqual([justMe.code, justMe.variant, justMe.afterBuy]);
    // it really moved: Ali's "left this month" now counts half of the month's joint money (150,000), not the 100,000 Ali paid in
    expect(leftOf(state) - fullBalance).toBe(50_000);
    expect(state.inputs?.household?.jointBack).toBeDefined();
  });

  it('keeps one source per snapshot and household facts, so the shared Prepared is built once', () => {
    const { source, jointId, balance } = jointSource();
    const hh = household(jointId, balance);
    const a = withHouseholdSource(source, hh);
    expect(withHouseholdSource(source, { ...hh })).toBe(a);
    expect(withHouseholdSource(source, undefined)).toBe(source);
  });
});
