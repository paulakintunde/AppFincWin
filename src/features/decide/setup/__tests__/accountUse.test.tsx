import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { FontScaleProvider } from '@/theme/FontScaleProvider';
import { suggestUse } from '../accountUseSuggest';
import { AccountUseList } from '../AccountUseList';
import { AccountUseStep } from '../steps/AccountUseStep';
import type { SetupStepReady } from '../steps/types';

let mockDecideV3 = true;
jest.mock('@/features/decide/useDecideAccess', () => ({ useDecideAccess: () => ({ v3: mockDecideV3 }) }));
jest.setTimeout(30000);
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@/ui/haptics', () => ({ hapticSelection: jest.fn() }));

const mockSaveOne = jest.fn((_i: Record<string, unknown>) => ({ stepId: 'step-one' }));
const mockSaveMany = jest.fn((_i: unknown) => ({ stepId: 'step-many' }));
const mockToast = jest.fn();
jest.mock('@/data/mutations/accountUse', () => ({
  useSaveAccountUse: () => ({ save: (i: Record<string, unknown>) => mockSaveOne(i) }),
  useSaveAccountUses: () => ({ save: (i: unknown) => mockSaveMany(i) }),
}));
jest.mock('@/state/undoToast', () => ({ showToast: (t: unknown) => mockToast(t) }));

const acct = (id: string, name: string, kind: string, over: Record<string, unknown> = {}) => ({
  id,
  household_id: 'h1',
  name,
  kind,
  currency: 'USD',
  opening_balance: 0,
  archived_at: null,
  deleted_at: null,
  version: 1,
  use: null,
  use_purpose: null,
  use_envelope_id: null,
  use_extra_set_aside: null,
  ...over,
});
const pot = (id: string, name: string, over: Record<string, unknown> = {}) => ({
  id,
  name,
  currency: 'USD',
  opening_saved: 25000,
  account_id: null,
  version: 1,
  kind: 'pot',
  ...over,
});
let mockAccounts: Record<string, unknown>[] = [];
let mockPots: Record<string, unknown>[] = [];
let mockSettings: Record<string, unknown> | null = null;
jest.mock('@/data/queries/accounts', () => ({ useAccounts: () => ({ data: mockAccounts }) }));
jest.mock('@/data/queries/activity', () => ({
  useAccountBalances: () => ({ balances: new Map(mockAccounts.map((a) => [a.id, { balance: 120000, overflow: false }])), isLoading: false }),
}));
jest.mock('@/data/queries/decide', () => ({
  usePots: () => ({ data: { plain: mockPots, live: mockPots, wait: [], done: [] } }),
  useDecideSettings: () => ({ data: mockSettings }),
}));
jest.mock('@/features/record/useRecordContext', () => ({
  useRecordContext: () => ({ householdId: 'h1', userId: 'u1', homeCurrency: 'USD', timeZone: 'UTC', today: '2026-10-15' }),
}));

const wrap = (node: React.ReactNode) => (
  <ThemeProvider>
    <FontScaleProvider>{node}</FontScaleProvider>
  </ThemeProvider>
);

beforeEach(() => {
  jest.clearAllMocks();
  mockAccounts = [];
  mockPots = [];
  mockSettings = null;
});

describe('suggestUse', () => {
  it('guesses from the account type and says nothing for the rest', () => {
    expect(suggestUse('checking')).toEqual({ kind: 'everyday' });
    expect(suggestUse('cash')).toEqual({ kind: 'everyday' });
    expect(suggestUse('savings')).toEqual({ kind: 'untouched' });
    expect(suggestUse('investment')).toEqual({ kind: 'untouched' });
    expect(suggestUse('other')).toBeNull();
    expect(suggestUse('credit')).toBeNull();
    expect(suggestUse('loan')).toBeNull();
  });
});

describe('AccountUseList', () => {
  it('lists money accounts only, shows suggestions, and stores nothing until "These look right"', async () => {
    mockAccounts = [acct('a1', 'Main', 'checking'), acct('a2', 'Rainy', 'savings'), acct('a3', 'Visa', 'credit'), acct('a4', 'Car loan', 'loan')];
    await render(wrap(<AccountUseList />));
    expect(screen.getByText('Main')).toBeTruthy();
    expect(screen.getByText('Rainy')).toBeTruthy();
    expect(screen.queryByText('Visa')).toBeNull();
    expect(screen.queryByText('Car loan')).toBeNull();
    expect(screen.getByText('Everyday?')).toBeTruthy();
    expect(mockSaveMany).not.toHaveBeenCalled();
    expect(mockSaveOne).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByText('These look right'));
    expect(mockSaveMany).toHaveBeenCalledTimes(1);
    const items = mockSaveMany.mock.calls[0]![0] as { account: { id: string }; use: { kind: string } }[];
    expect(items.map((i) => [i.account.id, i.use.kind])).toEqual([['a1', 'everyday'], ['a2', 'untouched']]);
  });

  it('reports whether every account has a stored use', async () => {
    const seen: boolean[] = [];
    mockAccounts = [acct('a1', 'Main', 'checking', { use: 'everyday' }), acct('a2', 'Odd', 'other')];
    await render(wrap(<AccountUseList onAllConfirmedChange={(v) => seen.push(v)} />));
    expect(seen[seen.length - 1]).toBe(false);
    expect(screen.getByText('Choose what it’s for')).toBeTruthy();
    expect(screen.queryByText('These look right')).toBeNull();
  });

  it('opens the sheet from a row and saves one account with the toast and its step id', async () => {
    mockAccounts = [acct('a1', 'Main', 'checking')];
    await render(wrap(<AccountUseList />));
    await fireEvent.press(screen.getByLabelText(/^Main,/));
    expect(screen.getByText('What is Main for?')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Everyday'));
    await fireEvent.press(screen.getByText('Save account use'));
    expect(mockSaveOne).toHaveBeenCalledTimes(1);
    expect(mockSaveOne.mock.calls[0]![0]).toMatchObject({ use: { kind: 'everyday' } });
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ stepId: 'step-one', text: { key: 'decide.accountUse.toastSaved' } }));
  });

  it('A mix lists envelopes, moves one from another account, and asks about anything else', async () => {
    mockAccounts = [acct('a1', 'Main', 'checking'), acct('a2', 'Rainy', 'savings')];
    mockPots = [pot('p1', 'Holiday'), pot('p2', 'Car repairs', { account_id: 'a2' })];
    await render(wrap(<AccountUseList />));
    await fireEvent.press(screen.getByLabelText(/^Main,/));
    await fireEvent.press(screen.getByLabelText('A mix'));
    expect(screen.getByText('Which of these sit in Main?')).toBeTruthy();
    expect(screen.getByText('Anything else set aside here?')).toBeTruthy();
    expect(screen.getByText('In Rainy')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText(/^Car repairs/));
    expect(screen.getByText('Moves from Rainy')).toBeTruthy();
    await fireEvent.press(screen.getByText('Save account use'));
    const call = mockSaveOne.mock.calls[0]![0] as { use: { kind: string }; placements: { goal: { id: string }; accountId: string | null }[] };
    expect(call.use.kind).toBe('mixed');
    expect(call.placements.map((p) => [p.goal.id, p.accountId])).toEqual([['p2', 'a1']]);
  });

  it('Kept for one thing asks which one and saves the envelope', async () => {
    mockAccounts = [acct('a1', 'Main', 'checking')];
    mockPots = [pot('p1', 'Holiday')];
    await render(wrap(<AccountUseList />));
    await fireEvent.press(screen.getByLabelText(/^Main,/));
    await fireEvent.press(screen.getByLabelText('Kept for one thing'));
    expect(screen.getByText('Which one?')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Holiday'));
    await fireEvent.press(screen.getByText('Save account use'));
    expect(mockSaveOne.mock.calls[0]![0]).toMatchObject({ use: { kind: 'dedicated', purpose: { kind: 'envelope', envelopeId: 'p1' } } });
  });

  it('warns when the emergency fund follows the account and its use is changed', async () => {
    mockAccounts = [acct('a1', 'Main', 'savings', { use: 'dedicated', use_purpose: 'emergency' })];
    mockSettings = { reserve_account_id: 'a1' };
    await render(wrap(<AccountUseList />));
    await fireEvent.press(screen.getByLabelText(/^Main,/));
    await fireEvent.press(screen.getByLabelText('Everyday'));
    expect(screen.getByText(/Your emergency fund follows this account/)).toBeTruthy();
  });
});

describe('AccountUseStep', () => {
  it('holds Continue until every account is answered and saves nothing itself', async () => {
    const ready: SetupStepReady[] = [];
    const ref = React.createRef<{ save(): { stepId: string | null } }>();
    mockAccounts = [acct('a1', 'Main', 'checking')];
    await render(wrap(<AccountUseStep ref={ref} mode="stepper" onReadyChange={(r) => ready.push(r)} />));
    expect(ready[ready.length - 1]!.canContinue).toBe(false);
    expect(ref.current!.save()).toEqual({ stepId: null });
  });

  it('allows Continue once every account has a stored use', async () => {
    const ready: SetupStepReady[] = [];
    mockAccounts = [acct('a1', 'Main', 'checking', { use: 'everyday' })];
    await render(wrap(<AccountUseStep mode="stepper" onReadyChange={(r) => ready.push(r)} />));
    expect(ready[ready.length - 1]).toMatchObject({ canContinue: true, reasonKey: null });
  });
});
