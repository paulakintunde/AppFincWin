/** Plan 05.3-32 (D-07, D-08): account use answered inside the question card, and the fund variant. */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { FontScaleProvider } from '@/theme/FontScaleProvider';
import { AccountUseBody } from '../AccountUseBody';
import { askToastKey } from '../AskCard';
import { accountUseQuestion } from './askTestKit';

jest.setTimeout(60000);
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@/ui/haptics', () => ({ hapticSelection: jest.fn() }));

jest.mock('../../shared/useV3Format', () => ({ useV3Format: () => jest.requireActual('./askTestKit').fakeFormat }));
const mockSaveUse =jest.fn((_i: Record<string, unknown>) => ({ stepId: 'step-use' }) as { stepId: string } | null);
const mockSaveFund = jest.fn((_i: Record<string, unknown>) => ({ stepId: 'step-fund' }) as { stepId: string } | null);
const mockToast = jest.fn();
jest.mock('@/data/mutations/accountUse', () => ({
  useSaveAccountUse: () => ({ save: (i: Record<string, unknown>) => mockSaveUse(i) }),
  useSaveEmergencyFund: () => ({ save: (i: Record<string, unknown>) => mockSaveFund(i), remove: jest.fn() }),
}));
jest.mock('@/state/undoToast', () => ({ showToast: (t: unknown) => mockToast(t) }));
jest.mock('@/features/decide/useDecideAccess', () => ({ useDecideAccess: () => ({ v3: true }) }));

const acct = (id: string, name: string, over: Record<string, unknown> = {}) => ({
  id,
  household_id: 'h1',
  name,
  kind: 'checking',
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
let mockAccounts: Record<string, unknown>[] = [];
jest.mock('@/data/queries/accounts', () => ({ useAccounts: () => ({ data: mockAccounts }) }));
jest.mock('@/data/queries/activity', () => ({
  useAccountBalances: () => ({ balances: new Map(mockAccounts.map((a) => [a.id, { balance: 900000, overflow: false }])), isLoading: false }),
}));
jest.mock('@/data/queries/decide', () => ({
  usePots: () => ({ data: { plain: [{ id: 'g1', name: 'Holiday', currency: 'USD', opening_saved: 25000, account_id: null, version: 1 }], live: [], wait: [], done: [] } }),
  useDecideSettings: () => ({ data: null }),
}));
jest.mock('@/data/queries/decideV3', () => ({
  useDecideV3: () => ({ status: 'ready', inputs: null, evaluation: { month: { e: 100000, recurringBills: 200000 } }, refetch: () => undefined }),
}));
jest.mock('@/features/record/useRecordContext', () => ({
  useRecordContext: () => ({ householdId: 'h1', userId: 'u1', homeCurrency: 'USD', timeZone: 'UTC', today: '2026-10-15' }),
}));

const wrap = (ui: React.ReactElement) => (
  <FontScaleProvider>
    <ThemeProvider>{ui}</ThemeProvider>
  </FontScaleProvider>
);
const props = (question = accountUseQuestion()) => ({ question, checkId: 'c1', userId: 'u1', householdId: 'h1', onSaved: jest.fn() });

beforeEach(() => {
  jest.clearAllMocks();
  mockAccounts = [acct('a1', 'Everyday Checking'), acct('a2', 'Rainy day', { kind: 'savings' })];
});

describe('AccountUseBody (use)', () => {
  it('lists the four choices with no extra Save row', async () => {
    await render(wrap(<AccountUseBody {...props()} />));
    for (const label of ['Everyday', 'A mix', 'Kept for one thing', 'Savings I don’t touch']) {
      expect(screen.getByRole('radio', { name: label })).toBeTruthy();
    }
    expect(screen.queryByText('Save account use')).toBeNull();
  });

  it('Everyday saves at once and reports the step (the card shows the toast)', async () => {
    const p = props();
    await render(wrap(<AccountUseBody {...p} />));
    await fireEvent.press(screen.getByRole('radio', { name: 'Everyday' }));
    expect(mockSaveUse).toHaveBeenCalledWith(expect.objectContaining({ use: { kind: 'everyday' } }));
    expect((mockSaveUse.mock.calls[0]![0] as { account: { id: string } }).account.id).toBe('a1');
    expect(p.onSaved).toHaveBeenCalledWith('step-use');
    expect(mockToast).not.toHaveBeenCalled();
    expect(askToastKey(p.question)).toBe('accountUseSaved');
  });

  it('Savings I don’t touch saves untouched at once', async () => {
    await render(wrap(<AccountUseBody {...props()} />));
    await fireEvent.press(screen.getByRole('radio', { name: 'Savings I don’t touch' }));
    expect(mockSaveUse).toHaveBeenCalledWith(expect.objectContaining({ use: { kind: 'untouched' } }));
  });

  it('A mix opens the second view; Back returns without saving; Save account use saves', async () => {
    const p = props();
    await render(wrap(<AccountUseBody {...p} />));
    await fireEvent.press(screen.getByRole('radio', { name: 'A mix' }));
    expect(mockSaveUse).not.toHaveBeenCalled();
    expect(screen.getByText('Save account use')).toBeTruthy();
    await fireEvent.press(screen.getByText('Back'));
    expect(screen.getByRole('radio', { name: 'Everyday' })).toBeTruthy();
    expect(mockSaveUse).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('radio', { name: 'A mix' }));
    await fireEvent.press(screen.getByText('Save account use'));
    expect(mockSaveUse).toHaveBeenCalledWith(expect.objectContaining({ use: { kind: 'mixed', extraSetAside: null } }));
    expect(p.onSaved).toHaveBeenCalledWith('step-use');
  });

  it('Kept for one thing needs a target before Save account use', async () => {
    await render(wrap(<AccountUseBody {...props()} />));
    await fireEvent.press(screen.getByRole('radio', { name: 'Kept for one thing' }));
    expect(screen.getByRole('button', { name: 'Save account use' }).props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(screen.getByRole('radio', { name: 'Holiday' }));
    await fireEvent.press(screen.getByText('Save account use'));
    expect(mockSaveUse).toHaveBeenCalledWith(expect.objectContaining({ use: { kind: 'dedicated', purpose: { kind: 'envelope', envelopeId: 'g1' } } }));
  });

  it('reports a null step when nothing changed', async () => {
    mockSaveUse.mockReturnValueOnce(null);
    const p = props();
    await render(wrap(<AccountUseBody {...p} />));
    await fireEvent.press(screen.getByRole('radio', { name: 'Everyday' }));
    expect(p.onSaved).toHaveBeenCalledWith(null);
  });

  it('renders nothing when the account is not found', async () => {
    mockAccounts = [];
    await render(wrap(<AccountUseBody {...props()} />));
    expect(screen.queryByRole('radio')).toBeNull();
  });
});

describe('AccountUseBody (fund)', () => {
  const fund = () => props(accountUseQuestion({ variant: 'fund', questionKey: 'decide.v3.missing.account_use_question_fund', params: {} }));

  it('lists accounts as radios; Save fund account stays off until one is chosen', async () => {
    await render(wrap(<AccountUseBody {...fund()} />));
    expect(screen.getAllByRole('radio').length).toBe(2);
    expect(screen.getByRole('button', { name: 'Save fund account' }).props.accessibilityState.disabled).toBe(true);
  });

  it('saves the chosen account as the fund and reports the step', async () => {
    const p = fund();
    await render(wrap(<AccountUseBody {...p} />));
    await fireEvent.press(screen.getAllByRole('radio')[1]!);
    await fireEvent.press(screen.getByText('Save fund account'));
    expect(mockSaveFund).toHaveBeenCalledTimes(1);
    const args = mockSaveFund.mock.calls[0]![0] as { accountId: string; linkUse: { use: unknown } | null };
    expect(args.accountId).toBe('a2');
    expect(p.onSaved).toHaveBeenCalledWith('step-fund');
    expect(askToastKey(p.question)).toBe('emergencySaved');
  });
});
