// 06.1-24: setup items 1 and 2. Regular bills (Not regular + Undo, the total, These are right sets the flag once, Save and close writes no
// flag) and Pay and payday (the four ways to count pay appear unchosen; 06.1-65: Save and close saves a changed answer). The pure rules are covered too.
import React from 'react';
import { fireEvent, screen, within } from '@testing-library/react-native';
import { wrap } from '@/test/stepProps';
import { expectFits } from '@/test/textFitMatrix';
import {
  anchorWithDay,
  billCountOf,
  buildBillRows,
  decideBillSetOf,
  decideBillsTotal,
  nextDateOnDay,
  regularCount,
  stopFromFor,
  type BillRow,
  type DecideBillSet,
} from '../itemLogic';
import { BillsSetup } from '../BillsSetup';
import { PaySetup } from '../PaySetup';

const mockReplace = jest.fn();
const mockDismissTo = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ replace: mockReplace, dismissTo: mockDismissTo, back: jest.fn(), push: jest.fn(), canGoBack: () => false }) }));
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
const onStopBill = jest.fn((..._a: unknown[]) => 'step-stop');

// 06.1-75: the bills Decide counts (the checklist's set), in the home currency.
let mockBills: { set: DecideBillSet | null; billsRight: boolean } = { set: null, billsRight: true };
jest.mock('@/features/decide/screens/setup/useSetupProgress', () => ({ useDecideBills: () => mockBills }));
const billSet = (monthly: Record<string, number>, elsewhere: string[] = []): DecideBillSet => ({
  monthly: new Map(Object.entries(monthly)),
  elsewhere: new Set(elsewhere),
  currency: 'USD',
});

const ACCOUNT = { id: 'acc-1', name: 'Everyday', currency: 'USD', kind: 'checking', deleted_at: null, archived_at: null };
let mockAccounts: unknown[] = [ACCOUNT];
jest.mock('@/data/queries/accounts', () => ({ useAccounts: () => ({ data: mockAccounts }) }));
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
  mockAccounts = [ACCOUNT];
  mockBills = { set: billSet({ 'series-rent': 120000 }), billsRight: true };
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

  it('lists found payments and a bill that exists only as a series; with no Decide set nothing says how it is counted', () => {
    const found = [candidate('a', 'Rent', 100000, 'regular'), candidate('b', 'Phone', 5000, 'notRegular'), candidate('c', 'Gym', 3000, 'unmarked'), candidate('w', 'Bus pass', 1000, 'regular', 2, 'weekly')];
    const handmade = seriesRow({ id: 'hand', name: 'Insurance', amount: -9500, income_kind: null, anchor_date: '2026-10-05' });
    const saving = seriesRow({ id: 'sv', name: 'Saving', amount: -20000, income_kind: null, saving_mode: 'fixed' });
    const pay = seriesRow({ id: 'pay' });
    const ended = seriesRow({ id: 'old', name: 'Old gym', amount: -2000, income_kind: null, end_date: '2026-10-01', end_reason: 'stopped' });
    const rows = buildBillRows(found as never, [handmade, saving, pay, ended] as never);
    // Rent and Bus pass have saved bills (anchored on the 15th), so they sort by the bill's day.
    expect(rows.map((r: BillRow) => r.name)).toEqual(['Gym', 'Phone', 'Insurance', 'Bus pass', 'Rent']);
    expect(regularCount(rows)).toBe(3);
    expect(rows.every((r) => r.counted === null && !r.toConfirm)).toBe(true);
  });

  it('06.1-75: the Decide set gives the monthly figures, the total and how each saved bill is counted', () => {
    const series = (id: string, role: string, amount: number, cadence = { unit: 'month', every: 1 }, status = 'live') => ({ id, role, amount, cadence, status });
    const set = decideBillSetOf({
      currency: 'USD',
      series: [series('rent', 'bill', 100000), series('bus', 'bill', 1000, { unit: 'week', every: 1 }), series('q', 'bill', 9000, { unit: 'month', every: 3 }), series('paused', 'bill', 500, undefined, 'paused'), series('sv', 'saving', 20000), series('inv', 'investing', 5000), series('pay', 'pay', 320000)],
      debts: [{ seriesId: 'loan' }, { seriesId: null }, {}],
    } as never);
    // weekly 1000 x 52 / 12 = 4333.33 -> 4333; quarterly 9000 / 3 = 3000
    expect([...set.monthly.entries()]).toEqual([['rent', 100000], ['bus', 4333], ['q', 3000]]);
    expect(decideBillsTotal(set)).toBe(107333);
    expect([...set.elsewhere].sort()).toEqual(['inv', 'loan', 'sv']);
    expect(billCountOf({ id: 'rent', goal_id: null }, set)).toBe('bill');
    expect(billCountOf({ id: 'sv' }, set)).toBe('elsewhere');
    expect(billCountOf({ id: 'laptop', goal_id: 'g1' }, set)).toBe('elsewhere');
    expect(billCountOf({ id: 'paused' }, set)).toBe('notCounted');
  });

  it('06.1-75: every bill Decide counts is listed, rows to confirm come first, and a saved bill shows its own amount', () => {
    const found = [candidate('rent', 'Rent', 100000, 'regular', 1), candidate('gym', 'Gym', 3000, 'unmarked', 9)];
    // The found row's saved bill was changed to 105000: the row shows the bill, not the logged payment (DC-5).
    (found[0] as { series: Record<string, unknown> }).series = seriesRow({ id: 'series-rent', name: 'Rent', amount: -105000, income_kind: null, anchor_date: '2026-10-02' });
    const futureEnd = seriesRow({ id: 'ending', name: 'Club', amount: -4000, income_kind: null, saving_mode: 'fixed', end_date: '2026-12-31', end_reason: 'stopped', anchor_date: '2026-10-20' });
    const rows = buildBillRows(found as never, [futureEnd] as never, billSet({ 'series-rent': 105000, ending: 4000 }), false);
    expect(rows.map((r) => [r.name, r.toConfirm])).toEqual([['Rent', true], ['Club', true], ['Gym', false]]);
    expect(rows[0]).toMatchObject({ amount: 105000, day: 2, counted: 'bill' });
  });

  it('06.1-75: a stop starts today, or on the first date of a bill that has not started yet', () => {
    expect(stopFromFor({ anchor_date: '2026-10-05' }, '2026-11-20')).toBe('2026-11-20');
    expect(stopFromFor({ anchor_date: '2026-12-05' }, '2026-11-20')).toBe('2026-12-05');
  });
});

describe('BillsSetup (D33)', () => {
  it('"Not regular" stores a dismissal and offers Undo', async () => {
    await wrap(<BillsSetup editSeriesFrom={editSeriesFrom} onStopBill={onStopBill} />);
    await fireEvent.press(screen.getByTestId('not-regular-gym'));
    expect(mockDismiss).toHaveBeenCalledWith({ payeeKey: 'Gym|k', direction: 'out', name: 'Gym' });
    expect(mockShowToast).toHaveBeenCalledWith(expect.objectContaining({ stepId: 'step-dismiss' }));
  });

  it('the total is the bills Decide counts, said in the home currency', async () => {
    await wrap(<BillsSetup editSeriesFrom={editSeriesFrom} onStopBill={onStopBill} />);
    expect(screen.getByTestId('bills-total')).toHaveTextContent('$1,200');
    expect(screen.getByText('Total each month, in USD')).toBeTruthy();
  });

  it('06.1-75 (DS-7): a CA$ bill keeps CA$ on its row and adds its converted amount to the total', async () => {
    mockSeries = [seriesRow({ id: 'audit', name: 'audit bill', amount: -500, currency: 'CAD', income_kind: null, anchor_date: '2026-11-20' })];
    mockBills = { set: billSet({ 'series-rent': 120000, audit: 360 }), billsRight: true };
    await wrap(<BillsSetup editSeriesFrom={editSeriesFrom} onStopBill={onStopBill} />);
    expect(within(screen.getByTestId('bill-audit')).getByText('CA$5')).toBeTruthy();
    expect(screen.getByTestId('bills-total')).toHaveTextContent('$1,203.60');
  });

  it('06.1-75 (DS-6): a payment Decide counts with a goal leaves the list and is named under it', async () => {
    mockSeries = [seriesRow({ id: 'laptop', name: 'Laptop', amount: -18000, income_kind: null, goal_id: 'g1' })];
    await wrap(<BillsSetup editSeriesFrom={editSeriesFrom} onStopBill={onStopBill} />);
    expect(screen.queryByTestId('bill-laptop')).toBeNull();
    expect(screen.getByTestId('bills-elsewhere')).toHaveTextContent('Counted with savings, goals or debts: Laptop.');
  });

  it('06.1-75: before the Decide inputs are read there is no total, and a saved bill Decide does not count says so', async () => {
    mockSeries = [seriesRow({ id: 'norate', name: 'Gym abroad', amount: -900, currency: 'XYZ', income_kind: null })];
    mockBills = { set: null, billsRight: true };
    const view = await wrap(<BillsSetup editSeriesFrom={editSeriesFrom} onStopBill={onStopBill} />);
    expect(screen.queryByTestId('bills-total')).toBeNull();
    mockBills = { set: billSet({ 'series-rent': 120000 }), billsRight: true };
    await view.rerender(<BillsSetup editSeriesFrom={editSeriesFrom} onStopBill={onStopBill} />);
    expect(within(screen.getByTestId('bill-norate')).getByText('Not counted in Decide yet.')).toBeTruthy();
  });

  it('06.1-75 (DS-15): with "These are right" not answered, the counted bill is marked and listed first', async () => {
    mockBills = { set: billSet({ 'series-rent': 120000 }), billsRight: false };
    await wrap(<BillsSetup editSeriesFrom={editSeriesFrom} onStopBill={onStopBill} />);
    expect(screen.getByTestId('bill-to-confirm-rent')).toHaveTextContent('Not confirmed yet');
    const ids = screen.getAllByTestId(/^bill-(rent|phone|gym)$/).map((n) => n.props.testID);
    expect(ids[0]).toBe('bill-rent');
  });

  it('06.1-75 (DB-2): the chosen chip is the current mark, the others act, and none looks live while off', async () => {
    await wrap(<BillsSetup editSeriesFrom={editSeriesFrom} onStopBill={onStopBill} />);
    // Rent is Regular: Regular is chosen (inert, says why), Not regular acts.
    expect(screen.getByTestId('regular-rent').props.accessibilityState).toEqual({ selected: true, disabled: true });
    expect(screen.getByTestId('regular-rent').props.accessibilityHint).toBe('Already marked.');
    expect(screen.getByTestId('not-regular-rent').props.accessibilityState).toEqual({ selected: false, disabled: false });
    // Phone is Not regular: Regular acts and makes the bill again.
    expect(screen.getByTestId('regular-phone').props.accessibilityState).toEqual({ selected: false, disabled: false });
    expect(screen.getByTestId('not-regular-phone').props.accessibilityState).toEqual({ selected: true, disabled: true });
    // Gym is unmarked: both act.
    expect(screen.getByTestId('regular-gym').props.accessibilityState).toEqual({ selected: false, disabled: false });
    expect(screen.getByTestId('not-regular-gym').props.accessibilityState).toEqual({ selected: false, disabled: false });
  });

  it('06.1-75 (OQ-75-1 A): "Not regular" on a Regular bill stops it from today, with Undo', async () => {
    await wrap(<BillsSetup editSeriesFrom={editSeriesFrom} onStopBill={onStopBill} />);
    await fireEvent.press(screen.getByTestId('not-regular-rent'));
    expect(onStopBill).toHaveBeenCalledWith(expect.objectContaining({ id: 'series-rent' }), '2026-11-20', 'user');
    expect(mockDismiss).not.toHaveBeenCalled();
    expect(mockShowToast).toHaveBeenCalledWith({ kind: 'ordinary', text: { key: 'decide.screens.setupPayBills.bills.stoppedToast', params: { name: 'Rent' } }, stepId: 'step-stop' });
  });

  it('06.1-75 (DC-6): the Change sheet of a saved bill has "Stopped"; an unmarked payment\'s sheet does not', async () => {
    await wrap(<BillsSetup editSeriesFrom={editSeriesFrom} onStopBill={onStopBill} />);
    await fireEvent.press(screen.getByTestId('change-gym'));
    expect(screen.queryByText('Stopped')).toBeNull();
    await fireEvent.press(screen.getByText('Cancel'));
    await fireEvent.press(screen.getByTestId('change-rent'));
    expect(screen.getByText('Ends from today. Past entries stay in Activity.')).toBeTruthy();
    await fireEvent.press(screen.getByText('Stopped'));
    expect(onStopBill).toHaveBeenCalledWith(expect.objectContaining({ id: 'series-rent' }), '2026-11-20', 'user');
    expect(mockShowToast).toHaveBeenCalledWith(expect.objectContaining({ stepId: 'step-stop' }));
    expect(screen.queryByText('Stopped')).toBeNull();
  });

  it('06.1-75: a refused stop date writes nothing and shows no toast', async () => {
    onStopBill.mockImplementationOnce(() => {
      throw new RangeError('setSeriesStatus: tooEarly');
    });
    await wrap(<BillsSetup editSeriesFrom={editSeriesFrom} onStopBill={onStopBill} />);
    await fireEvent.press(screen.getByTestId('not-regular-rent'));
    expect(mockShowToast).not.toHaveBeenCalled();
  });

  it('06.1-75 (DC-5): after Change, the row and the total show the new amount as soon as the series read has it', async () => {
    const view = await wrap(<BillsSetup editSeriesFrom={editSeriesFrom} onStopBill={onStopBill} />);
    // The optimistic series patch (recurringSeries.ts) changes the cached series; Decide's set follows from the same read.
    mockCandidates = [{ ...(mockCandidates[0] as object), series: seriesRow({ id: 'series-rent', name: 'Rent', amount: -125000, income_kind: null }) }, ...mockCandidates.slice(1)];
    mockBills = { set: billSet({ 'series-rent': 125000 }), billsRight: true };
    await view.rerender(<BillsSetup editSeriesFrom={editSeriesFrom} onStopBill={onStopBill} />);
    expect(within(screen.getByTestId('bill-rent')).getByText('$1,250')).toBeTruthy();
    expect(screen.getByTestId('bills-total')).toHaveTextContent('$1,250');
  });

  it('06.1-75: with no account to save to, "Regular" looks and reads as off and says why', async () => {
    mockCandidates = [{ ...candidate('gym', 'Gym', 3000, 'unmarked', 9), accountId: null }];
    mockAccounts = [];
    await wrap(<BillsSetup editSeriesFrom={editSeriesFrom} onStopBill={onStopBill} />);
    expect(screen.getByTestId('regular-gym').props.accessibilityState).toEqual({ selected: false, disabled: true });
    expect(within(screen.getByTestId('bill-gym')).getByText('There is no account to save a bill to yet.')).toBeTruthy();
  });

  it('"Regular" on an unmarked row makes a bill series in Activity', async () => {
    await wrap(<BillsSetup editSeriesFrom={editSeriesFrom} onStopBill={onStopBill} />);
    await fireEvent.press(screen.getByTestId('regular-gym'));
    expect(mockConfirm).toHaveBeenCalledWith(expect.objectContaining({ direction: 'out', linkTransactionIds: ['gym-r1'] }));
    expect(mockConfirm.mock.calls[0]?.[0]).toMatchObject({ series: { name: 'Gym', amount: 3000, freq: 'monthly' } });
  });

  it('"These are right" sets the bills-right flag once and returns to the checklist', async () => {
    await wrap(<BillsSetup editSeriesFrom={editSeriesFrom} onStopBill={onStopBill} />);
    await fireEvent.press(screen.getByText('These are right'));
    expect(mockSetAnswered).toHaveBeenCalledTimes(1);
    expect(mockSetAnswered).toHaveBeenCalledWith({ flag: 'bills_right', on: true });
    expect(mockDismissTo).toHaveBeenCalledWith('/decide/setup');
  });

  it('"Save and close" returns to the checklist without setting the flag', async () => {
    await wrap(<BillsSetup editSeriesFrom={editSeriesFrom} onStopBill={onStopBill} />);
    await fireEvent.press(screen.getByTestId('item-save-close'));
    expect(mockSetAnswered).not.toHaveBeenCalled();
    expect(mockDismissTo).toHaveBeenCalledWith('/decide/setup');
  });

  it('fits at the large text sizes', async () => {
    await wrap(<BillsSetup editSeriesFrom={editSeriesFrom} onStopBill={onStopBill} />, 2);
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

  it('06.1-65 (FQ4): "Save and close" saves the changed answer, then leaves', async () => {
    await wrap(<PaySetup editSeriesFrom={editSeriesFrom} />);
    await fireEvent.press(screen.getByText('About the same'));
    await fireEvent.press(screen.getByTestId('item-save-close'));
    expect(mockSaveStep).toHaveBeenCalledTimes(1);
    expect(mockSaveStep).toHaveBeenCalledWith(expect.objectContaining({ patch: expect.objectContaining({ income_pattern: 'steady', income_pattern_confirmed: true }) }));
    expect(mockSetAnswered).not.toHaveBeenCalled();
    expect(mockDismissTo).toHaveBeenCalledWith('/decide/setup');
  });
});
