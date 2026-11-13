// 06.1-24: setup items 1 and 2. Regular bills (Not regular + Undo, the total, These are right sets the flag once, Save and close writes no
// flag) and Pay and payday (the four ways to count pay appear unchosen). The pure rules are covered too.
import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import { wrap } from '@/test/stepProps';
import { expectFits } from '@/test/textFitMatrix';
import { anchorWithDay, buildBillRows, nextDateOnDay, regularCount, regularMonthlyTotal, type BillRow } from '../itemLogic';
import { BillsSetup } from '../BillsSetup';
import { PaySetup } from '../PaySetup';

const mockReplace = jest.fn();
const mockDismissTo = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ replace: mockReplace, dismissTo: mockDismissTo, back: jest.fn(), push: jest.fn() }) }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'new-id' }));
jest.mock('@/ui/haptics', () => ({ hapticLight: jest.fn(), hapticSelection: jest.fn() }));
jest.mock('@/services/locale/deviceLocale', () => ({ useDeviceLocale: () => ({ locale: 'en-US', timeZone: 'UTC' }) }));

const mockShowToast = jest.fn();
jest.mock('@/state/undoToast', () => ({ showToast: (...a: unknown[]) => mockShowToast(...a) }));

const mockDismiss = jest.fn((..._a: unknown[]) => ({ stepId: 'step-dismiss' }));
jest.mock('@/data/mutations/dismissals', () => ({ useAddDismissal: () => ({ dismiss: mockDismiss }) }));
const mockSetAnswered = jest.fn((..._a: unknown[]) => ({ stepId: 'step-flag' }));
const mockSaveStep = jest.fn((..._a: unknown[]) => ({ stepId: 'step-save' }));
jest.mock('@/data/mutations/decideSetup', () => ({
  useSetDecideAnswered: () => ({ set: mockSetAnswered }),
  useSaveSetupStep: () => ({ save: mockSaveStep }),
}));
const mockConfirm = jest.fn((..._a: unknown[]) => ({ seriesId: 'new-id', stepId: 'step-confirm' }));
jest.mock('@/data/mutations/seriesAttributes', () => ({
  useConfirmRegularCandidate: () => ({ confirm: mockConfirm }),
  usePatchSeriesAttributes: () => ({ patch: jest.fn() }),
}));
const editSeriesFrom = jest.fn((..._a: unknown[]) => 'step-edit');

const ACCOUNT = { id: 'acc-1', name: 'Everyday', currency: 'USD', kind: 'checking', deleted_at: null, archived_at: null };
jest.mock('@/data/queries/accounts', () => ({ useAccounts: () => ({ data: [ACCOUNT] }) }));
let mockSeries: unknown[] = [];
jest.mock('@/data/queries/recurringSeries', () => ({ useRecurringSeries: () => ({ data: mockSeries }) }));

let mockCandidates: unknown[] = [];
jest.mock('@/features/decide/screens/setup/items/useRegularCandidates', () => ({
  useRegularCandidates: () => ({ rows: mockCandidates, paused: [], isLoading: false, householdId: 'hh', userId: 'user', today: '2026-11-20', homeCurrency: 'USD', timeZone: 'UTC' }),
}));
let mockIncome: Record<string, unknown> = {};
jest.mock('@/features/income/useIncomeContext', () => ({ useIncomeContext: () => mockIncome }));

const seriesRow = (over: Record<string, unknown> = {}) => ({
  id: 's1', name: 'Take-home pay', amount: 320000, currency: 'USD', anchor_date: '2026-10-15', freq: 'monthly', end_date: null, end_reason: null,
  deleted_at: null, version: 1, account_id: 'acc-1', income_kind: 'salary', counts_as: 'available', saving_mode: null, ...over,
});

function candidate(id: string, name: string, amount: number, state: 'regular' | 'notRegular' | 'unmarked', day = 1, freq = 'monthly') {
  return {
    id,
    candidate: { key: `${name}|k`, name, direction: 'out', cadence: { unit: 'month', every: 1 }, anchorDate: `2026-10-${String(day).padStart(2, '0')}`, amount, rowIds: [`${id}-r1`], payGroupKey: null },
    state,
    currency: 'USD',
    accountId: 'acc-1',
    categoryId: null,
    series: state === 'regular' ? seriesRow({ id: `series-${id}`, name, amount: -amount, income_kind: null }) : null,
    dismissal: null,
    freq,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSeries = [];
  mockCandidates = [candidate('rent', 'Rent', 120000, 'regular', 1), candidate('phone', 'Phone', 4500, 'notRegular', 3), candidate('gym', 'Gym', 3000, 'unmarked', 9)];
  mockIncome = {
    userId: 'user', householdId: 'hh', homeCurrency: 'USD', timeZone: 'UTC', today: '2026-11-20', settings: null,
    accounts: [ACCOUNT], series: [seriesRow()], found: null, notPay: [],
  };
});

describe('item rules', () => {
  it('holds a day to the length of the month and finds the next payday', () => {
    expect(anchorWithDay('2026-02-10', 31)).toBe('2026-02-28');
    expect(anchorWithDay('2026-11-20', 5)).toBe('2026-11-05');
    expect(nextDateOnDay('2026-11-20', 25)).toBe('2026-11-25');
    expect(nextDateOnDay('2026-11-20', 5)).toBe('2026-12-05');
    expect(nextDateOnDay('2026-12-20', 5)).toBe('2027-01-05');
    expect(nextDateOnDay('2026-01-31', 31)).toBe('2026-01-31');
  });

  it('counts only Regular rows, at their monthly figure, and lists a bill that exists only as a series', () => {
    const found = [candidate('a', 'Rent', 100000, 'regular'), candidate('b', 'Phone', 5000, 'notRegular'), candidate('c', 'Gym', 3000, 'unmarked'), candidate('w', 'Bus pass', 1000, 'regular', 2, 'weekly')];
    const handmade = seriesRow({ id: 'hand', name: 'Insurance', amount: -9500, income_kind: null, anchor_date: '2026-10-05' });
    const saving = seriesRow({ id: 'sv', name: 'Saving', amount: -20000, income_kind: null, saving_mode: 'fixed' });
    const pay = seriesRow({ id: 'pay' });
    const rows = buildBillRows(found as never, [handmade, saving, pay] as never);
    expect(rows.map((r: BillRow) => r.name)).toEqual(['Gym', 'Phone', 'Rent', 'Bus pass', 'Insurance']);
    expect(regularCount(rows)).toBe(3);
    // 100000 + weekly 1000 x 52 / 12 = 4333.33 -> 4333 + 9500
    expect(regularMonthlyTotal(rows)).toBe(100000 + 4333 + 9500);
  });
});

describe('BillsSetup (D33)', () => {
  it('"Not regular" stores a dismissal and offers Undo', async () => {
    await wrap(<BillsSetup editSeriesFrom={editSeriesFrom} />);
    await fireEvent.press(screen.getByTestId('not-regular-gym'));
    expect(mockDismiss).toHaveBeenCalledWith({ payeeKey: 'Gym|k', direction: 'out', name: 'Gym' });
    expect(mockShowToast).toHaveBeenCalledWith(expect.objectContaining({ stepId: 'step-dismiss' }));
  });

  it('the total counts only Regular rows', async () => {
    await wrap(<BillsSetup editSeriesFrom={editSeriesFrom} />);
    expect(screen.getByTestId('bills-total')).toHaveTextContent('$1,200');
  });

  it('"Regular" on an unmarked row makes a bill series in Activity', async () => {
    await wrap(<BillsSetup editSeriesFrom={editSeriesFrom} />);
    await fireEvent.press(screen.getByTestId('regular-gym'));
    expect(mockConfirm).toHaveBeenCalledWith(expect.objectContaining({ direction: 'out', linkTransactionIds: ['gym-r1'] }));
    expect(mockConfirm.mock.calls[0]?.[0]).toMatchObject({ series: { name: 'Gym', amount: 3000, freq: 'monthly' } });
  });

  it('"These are right" sets the bills-right flag once and returns to the checklist', async () => {
    await wrap(<BillsSetup editSeriesFrom={editSeriesFrom} />);
    await fireEvent.press(screen.getByText('These are right'));
    expect(mockSetAnswered).toHaveBeenCalledTimes(1);
    expect(mockSetAnswered).toHaveBeenCalledWith({ flag: 'bills_right', on: true });
    expect(mockDismissTo).toHaveBeenCalledWith('/decide/setup');
  });

  it('"Save and close" returns to the checklist without setting the flag', async () => {
    await wrap(<BillsSetup editSeriesFrom={editSeriesFrom} />);
    await fireEvent.press(screen.getByTestId('item-save-close'));
    expect(mockSetAnswered).not.toHaveBeenCalled();
    expect(mockDismissTo).toHaveBeenCalledWith('/decide/setup');
  });

  it('fits at the large text sizes', async () => {
    await wrap(<BillsSetup editSeriesFrom={editSeriesFrom} />, 2);
    expectFits();
  });
});

describe('PaySetup (D32)', () => {
  const four = ['Match what comes in', 'Spread large payments over the months they cover', 'Pay myself a steady amount', 'Go by my bank balance'];

  it('"It changes" shows the four ways to count pay with none chosen', async () => {
    await wrap(<PaySetup editSeriesFrom={editSeriesFrom} />);
    expect(screen.queryByText(four[0] as string)).toBeNull();
    await fireEvent.press(screen.getByText('It changes'));
    for (const label of four) {
      const node = screen.getByLabelText(label);
      expect(node.props.accessibilityState).toMatchObject({ checked: false });
    }
  });

  it('shows what Activity found and saves the answers on "Save pay details"', async () => {
    await wrap(<PaySetup editSeriesFrom={editSeriesFrom} />);
    expect(screen.getByTestId('pay-found')).toHaveTextContent(/3,200/);
    await fireEvent.press(screen.getByText('About the same'));
    await fireEvent.press(screen.getByText('Save pay details'));
    // 06.1-54 (C-3): with found pay and nothing stored, "Salary or wages" is pre-picked and saved with the answers.
    expect(mockSaveStep).toHaveBeenCalledWith(expect.objectContaining({ patch: { income_types: ['salary_or_wages'], income_pattern: 'steady', income_pattern_confirmed: true } }));
    expect(mockConfirm).not.toHaveBeenCalled();
    expect(mockDismissTo).toHaveBeenCalledWith('/decide/setup');
  });

  it('with no pay found, the fields are shown and Save pay details waits for them', async () => {
    mockIncome = { ...mockIncome, series: [] };
    await wrap(<PaySetup editSeriesFrom={editSeriesFrom} />);
    expect(screen.getByTestId('pay-empty')).toBeTruthy();
    expect(screen.getByText('How much lands in your account?')).toBeTruthy();
    await fireEvent.press(screen.getByText('Save pay details'));
    expect(mockConfirm).not.toHaveBeenCalled();
  });

  it('06.1-29 FIN-20: no tax set-aside row unless the income types include freelance', async () => {
    mockIncome = { ...mockIncome, settings: { income_types: ['salary_or_wages'], tax_set_aside_bp: 2500 } };
    await wrap(<PaySetup editSeriesFrom={editSeriesFrom} />);
    expect(screen.queryByTestId('pay-tax-set-aside')).toBeNull();
    await fireEvent.press(screen.getByText('About the same'));
    await fireEvent.press(screen.getByText('Save pay details'));
    expect(mockSaveStep).toHaveBeenCalledWith(expect.objectContaining({ patch: { income_pattern: 'steady', income_pattern_confirmed: true } }));
  });

  it('06.1-29 FIN-20: a freelancer sees the row empty, a share above 60 holds Save, and a typed share is saved as basis points', async () => {
    mockIncome = { ...mockIncome, settings: { income_types: ['freelance'], tax_set_aside_bp: null } };
    await wrap(<PaySetup editSeriesFrom={editSeriesFrom} />);
    const field = screen.getByLabelText('Set aside for tax, % of freelance pay');
    expect(field.props.value).toBe('');
    await fireEvent.changeText(field, '75');
    expect(screen.getByText('The share goes from 0% to 60%.')).toBeTruthy();
    await fireEvent.press(screen.getByText('Save pay details'));
    expect(mockSaveStep).not.toHaveBeenCalled();
    await fireEvent.changeText(field, '25%');
    expect(screen.queryByText('The share goes from 0% to 60%.')).toBeNull();
    await fireEvent.press(screen.getByText('Save pay details'));
    expect(mockSaveStep).toHaveBeenCalledWith(expect.objectContaining({ patch: { tax_set_aside_bp: 2500 } }));
  });

  it('06.1-29 FIN-20: an unchanged share writes nothing; clearing it writes none', async () => {
    mockIncome = { ...mockIncome, settings: { income_types: ['own_business'], tax_set_aside_bp: 2500 } };
    await wrap(<PaySetup editSeriesFrom={editSeriesFrom} />);
    const field = screen.getByLabelText('Set aside for tax, % of freelance pay');
    expect(field.props.value).toBe('25');
    await fireEvent.press(screen.getByText('Save pay details'));
    expect(mockSaveStep).not.toHaveBeenCalled();
    await fireEvent.changeText(field, '');
    await fireEvent.press(screen.getByText('Save pay details'));
    expect(mockSaveStep).toHaveBeenCalledWith(expect.objectContaining({ patch: { tax_set_aside_bp: null } }));
  });

  it('"Save and close" returns without saving anything', async () => {
    await wrap(<PaySetup editSeriesFrom={editSeriesFrom} />);
    await fireEvent.press(screen.getByText('About the same'));
    await fireEvent.press(screen.getByTestId('item-save-close'));
    expect(mockSaveStep).not.toHaveBeenCalled();
    expect(mockSetAnswered).not.toHaveBeenCalled();
    expect(mockDismissTo).toHaveBeenCalledWith('/decide/setup');
  });
});
