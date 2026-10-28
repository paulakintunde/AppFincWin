import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { FontScaleProvider } from '@/theme/FontScaleProvider';
import { EmergencyStep } from '../steps/EmergencyStep';
import { EmergencyFundSheet } from '../EmergencyFundSheet';
import type { SetupStepHandle, SetupStepReady } from '../steps/types';

jest.setTimeout(30000);
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@/ui/haptics', () => ({ hapticSelection: jest.fn() }));

const mockSave = jest.fn((_i: Record<string, unknown>) => ({ stepId: 'step-save' }) as { stepId: string } | null);
const mockRemove = jest.fn(() => ({ stepId: 'step-remove' }));
const mockToast = jest.fn();
jest.mock('@/data/mutations/accountUse', () => ({
  useSaveEmergencyFund: () => ({ save: (i: Record<string, unknown>) => mockSave(i), remove: () => mockRemove() }),
}));
jest.mock('@/state/undoToast', () => ({ showToast: (t: unknown) => mockToast(t) }));

const acct = (id: string, name: string, over: Record<string, unknown> = {}) => ({
  id,
  household_id: 'h1',
  name,
  kind: 'savings',
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
let mockSettings: Record<string, unknown> | null = null;
jest.mock('@/data/queries/accounts', () => ({ useAccounts: () => ({ data: mockAccounts }) }));
jest.mock('@/data/queries/activity', () => ({
  useAccountBalances: () => ({ balances: new Map(mockAccounts.map((a) => [a.id, { balance: 900000, overflow: false }])), isLoading: false }),
}));
jest.mock('@/data/queries/decide', () => ({ useDecideSettings: () => ({ data: mockSettings }) }));
jest.mock('@/data/queries/decideV3', () => ({
  useDecideV3: () => ({ status: 'ready', inputs: null, evaluation: { month: { e: 100000, recurringBills: 200000 } }, refetch: () => undefined }),
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
  mockAccounts = [acct('a1', 'High-interest savings', { use: 'everyday' }), acct('a2', 'Rainy day', { use: 'mixed' })];
  mockSettings = null;
});

async function mountStep() {
  const ready: SetupStepReady[] = [];
  const ref = React.createRef<SetupStepHandle>();
  await render(wrap(<EmergencyStep ref={ref} mode="stepper" onReadyChange={(r) => ready.push(r)} />));
  return { ref, last: () => ready[ready.length - 1]! };
}

const choose = async (accountName: string) => {
  await fireEvent.press(screen.getByLabelText('Yes, I keep an emergency fund'));
  await fireEvent.press(screen.getByLabelText('Or pick the account that holds it'));
  await fireEvent.press(screen.getByLabelText(new RegExp(`^${accountName}`)));
};

describe('EmergencyStep (D-04)', () => {
  it('asks once for an everyday account and previews the result', async () => {
    await mountStep();
    await choose('High-interest savings');
    expect(screen.getByText('Does this account also hold money you spend?')).toBeTruthy();
    expect(screen.getByText('High-interest savings will be set to: kept for the emergency fund.')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Yes'));
    expect(screen.getByText('High-interest savings will be set to: a mix.')).toBeTruthy();
    // 05.2-37 (e): a mix takes a stated amount, prefilled with the balance, not "follows this account".
    expect(screen.queryByText('The amount follows this account’s balance.')).toBeNull();
    expect(screen.getByLabelText('Amount kept for emergencies')).toBeTruthy();
  });

  it('asks the fund amount for a dedicated account no more than it follows the balance', async () => {
    await mountStep();
    await choose('High-interest savings');
    expect(screen.getByText('The amount follows this account’s balance.')).toBeTruthy();
    expect(screen.queryByLabelText('Amount kept for emergencies')).toBeNull();
  });

  it('asks nothing for a mixed account', async () => {
    await mountStep();
    await choose('Rainy day');
    expect(screen.queryByText('Does this account also hold money you spend?')).toBeNull();
    expect(screen.queryByText('The amount follows this account’s balance.')).toBeNull();
    expect((screen.getByLabelText('Amount kept for emergencies').props as { value: string }).value).toMatch(/9,?000/);
  });

  it('saves the prefilled balance for a mixed account when the amount is untouched', async () => {
    const first = await mountStep();
    await choose('Rainy day');
    await act(async () => {
      first.ref.current!.save();
    });
    expect((mockSave.mock.calls[0]![0] as { amount: number }).amount).toBe(900000);
  });

  it('saves a typed amount for a mixed account', async () => {
    const { ref } = await mountStep();
    await choose('Rainy day');
    await fireEvent.changeText(screen.getByLabelText('Amount kept for emergencies'), '2500');
    await act(async () => {
      ref.current!.save();
    });
    expect(mockSave.mock.calls[0]![0]).toMatchObject({ amount: 250000, accountId: 'a2', linkUse: null });
  });

  it('saves once with the account and the use it becomes', async () => {
    const { ref, last } = await mountStep();
    expect(last().dirty).toBe(false);
    await choose('High-interest savings');
    expect(last().dirty).toBe(true);
    let out: { stepId: string | null } | undefined;
    await act(async () => {
      out = ref.current!.save();
    });
    expect(out).toEqual({ stepId: 'step-save' });
    expect(mockSave).toHaveBeenCalledTimes(1);
    const arg = mockSave.mock.calls[0]![0] as { amount: number; accountId: string; linkUse: { use: unknown; account: { id: string } } };
    expect(arg.accountId).toBe('a1');
    expect(arg.amount).toBe(900000);
    expect(arg.linkUse.account.id).toBe('a1');
    expect(arg.linkUse.use).toEqual({ kind: 'dedicated', purpose: { kind: 'emergency' } });
  });

  it('sends a mix when the answer is Yes, and no use change for a mixed account', async () => {
    const first = await mountStep();
    await choose('High-interest savings');
    await fireEvent.press(screen.getByLabelText('Yes'));
    await act(async () => {
      first.ref.current!.save();
    });
    expect((mockSave.mock.calls[0]![0] as { linkUse: { use: unknown } }).linkUse.use).toEqual({ kind: 'mixed', extraSetAside: null });
  });

  it('writes no use change for a mixed account', async () => {
    const { ref } = await mountStep();
    await choose('Rainy day');
    await act(async () => {
      ref.current!.save();
    });
    expect((mockSave.mock.calls[0]![0] as { linkUse: unknown }).linkUse).toBeNull();
  });

  it('returns null and writes nothing when nothing changed', async () => {
    const { ref } = await mountStep();
    let out: { stepId: string | null } | undefined;
    await act(async () => {
      out = ref.current!.save();
    });
    expect(out).toEqual({ stepId: null });
    expect(mockSave).not.toHaveBeenCalled();
  });

  it('Not yet shows the optional goal with the three-month hint', async () => {
    const { ref } = await mountStep();
    await fireEvent.press(screen.getByLabelText('Not yet'));
    expect(screen.getByText('A goal, if you’d like one (optional)')).toBeTruthy();
    expect(screen.getByText(/Three months of your regular payments and everyday spending is about \$9,000/)).toBeTruthy();
    expect(screen.getByText(/kept out of purchase checks/)).toBeTruthy();
    await act(async () => {
      ref.current!.save();
    });
    expect(mockSave).not.toHaveBeenCalled();
  });

  it('pre-fills an account already kept for the emergency fund', async () => {
    mockAccounts = [acct('a1', 'High-interest savings', { use: 'dedicated', use_purpose: 'emergency' })];
    const { ref, last } = await mountStep();
    expect(screen.getByLabelText('You said High-interest savings is kept for the emergency fund.')).toBeTruthy();
    expect(screen.queryByText('Does this account also hold money you spend?')).toBeNull();
    expect(last().dirty).toBe(true);
    await act(async () => {
      ref.current!.save();
    });
    expect(mockSave).toHaveBeenCalledTimes(1);
    expect((mockSave.mock.calls[0]![0] as { linkUse: unknown }).linkUse).toBeNull();
  });
});

describe('EmergencyFundSheet', () => {
  const open = async () => render(wrap(<EmergencyFundSheet visible onClose={jest.fn()} />));

  it('shows the three states and nothing about a used fund', async () => {
    await open();
    expect(screen.getByLabelText('A set amount')).toBeTruthy();
    expect(screen.getByLabelText('An account')).toBeTruthy();
    expect(screen.getByLabelText('Not set')).toBeTruthy();
    expect(screen.queryByText(/rebuilding/)).toBeNull();
    expect(screen.queryByLabelText('Remove emergency fund')).toBeNull();
  });

  it('Not set shows the goal field and the empty goal line', async () => {
    await open();
    await fireEvent.press(screen.getByLabelText('Not set'));
    expect(screen.getByText('A goal, if you’d like one (optional)')).toBeTruthy();
    expect(screen.getByText('An emergency fund goal isn’t set yet.')).toBeTruthy();
  });

  it('saves an account and names it in the toast when its use changed', async () => {
    await open();
    await fireEvent.press(screen.getByLabelText('An account'));
    await fireEvent.press(screen.getByLabelText(/^High-interest savings/));
    expect(screen.getByText('High-interest savings will be set to: kept for the emergency fund.')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Save emergency fund'));
    expect(mockSave).toHaveBeenCalledTimes(1);
    expect(mockToast).toHaveBeenCalledWith({
      kind: 'ordinary',
      text: { key: 'decide.emergencySheet.toastSavedAccount', params: { account: 'High-interest savings' } },
      stepId: 'step-save',
    });
  });

  it('saves an account whose use needs no change with the plain toast', async () => {
    mockSettings = { reserve: 500000, reserve_account_id: null, reserve_goal: null, currency: 'USD' };
    await open();
    await fireEvent.press(screen.getByLabelText('An account'));
    await fireEvent.press(screen.getByLabelText(/^Rainy day/));
    await fireEvent.press(screen.getByLabelText('Save emergency fund'));
    expect(mockToast).toHaveBeenCalledWith({ kind: 'ordinary', text: { key: 'decide.emergencySheet.toastSaved' }, stepId: 'step-save' });
  });

  it('removes with no confirm and the bank-safe toast', async () => {
    mockSettings = { reserve: 500000, reserve_account_id: null, reserve_goal: null, currency: 'USD' };
    await open();
    await fireEvent.press(screen.getByLabelText('Remove emergency fund'));
    expect(mockRemove).toHaveBeenCalledTimes(1);
    expect(mockToast).toHaveBeenCalledWith({ kind: 'ordinary', text: { key: 'decide.emergencySheet.toastRemoved' }, stepId: 'step-remove' });
  });

  it('shows the used line only when given', async () => {
    await render(wrap(<EmergencyFundSheet visible onClose={jest.fn()} usedLine="Used $600 on Oct 12 · rebuilding" />));
    expect(screen.getByText('Used $600 on Oct 12 · rebuilding')).toBeTruthy();
  });
});
