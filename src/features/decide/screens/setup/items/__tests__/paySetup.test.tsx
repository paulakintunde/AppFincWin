// 06.1-54 (G-6: C-3, A-SU-4, C-21, DC-8): Pay and payday ticks once saved. "How are you paid?" chips, income_types written on Save
// pay details (also with no other edit), the found pay from an unmarked Activity series, the day picker and the missing-part line.
// The integration case runs the saved income_types through settingsSourceOf and buildV3Inputs into setupFactsFrom.
import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import { wrap } from '@/test/stepProps';
import { EMPTY_DECIDE_SETTINGS } from '@/db/decideSettings';
import { demoSource } from '@/features/decide/__tests__/helpers/demoScenario';
import { buildV3Inputs } from '@/features/decide/snapshot/v3/buildV3Inputs';
import { settingsSourceOf } from '@/features/decide/snapshot/v3/settingsSource';
import { setupFactsFrom } from '../../useSetupProgress';
import { PaySetup, firstNeed, sameTypes, toggledTypes, unmarkedPaySeries } from '../PaySetup';

const mockDismissTo = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ replace: jest.fn(), dismissTo: mockDismissTo, back: jest.fn(), push: jest.fn(), canGoBack: () => false }) }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'new-id' }));
jest.mock('@/ui/haptics', () => ({ hapticLight: jest.fn(), hapticSelection: jest.fn() }));
// setupFactsFrom is pure; its module's read hooks are not used here.
jest.mock('@/data/queries/decide', () => ({}));
jest.mock('@/data/queries/decideV3', () => ({}));
jest.mock('@/features/record/useRecordContext', () => ({}));
jest.mock('@/services/locale/deviceLocale', () => ({ useDeviceLocale: () => ({ locale: 'en-US', timeZone: 'UTC' }) }));

const mockShowToast = jest.fn();
jest.mock('@/state/undoToast', () => ({ showToast: (...a: unknown[]) => mockShowToast(...a) }));
const mockSaveStep = jest.fn((..._a: unknown[]) => ({ stepId: 'step-save' }));
jest.mock('@/data/mutations/decideSetup', () => ({ useSaveSetupStep: () => ({ save: mockSaveStep }) }));
const mockConfirm = jest.fn((..._a: unknown[]) => ({ seriesId: 'new-id', stepId: 'step-confirm' }));
const mockPatch = jest.fn((..._a: unknown[]): { stepId: string } | null => ({ stepId: 'step-mark' }));
jest.mock('@/data/mutations/seriesAttributes', () => ({
  useConfirmRegularCandidate: () => ({ confirm: mockConfirm }),
  usePatchSeriesAttributes: () => ({ patch: mockPatch }),
}));
let mockIncome: Record<string, unknown> = {};
jest.mock('@/features/income/useIncomeContext', () => ({ useIncomeContext: () => mockIncome }));

// Sheet-opening cases press several times; under a loaded runner they pass the 5 s default.
jest.setTimeout(30_000);

const editSeriesFrom = jest.fn((..._a: unknown[]) => 'step-edit');
const ACCOUNT = { id: 'acc-1', name: 'Everyday', currency: 'USD', kind: 'checking', deleted_at: null, archived_at: null };
const seriesRow = (over: Record<string, unknown> = {}) => ({
  id: 's1', name: 'Take-home pay', amount: 320000, currency: 'USD', anchor_date: '2026-10-15', freq: 'monthly', end_date: null, end_reason: null,
  deleted_at: null, version: 1, account_id: 'acc-1', income_kind: 'salary', counts_as: 'available', saving_mode: null, goal_id: null, ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockIncome = {
    userId: 'user', householdId: 'hh', homeCurrency: 'USD', timeZone: 'UTC', today: '2026-11-20', settings: null,
    accounts: [ACCOUNT], series: [seriesRow()], found: null, notPay: [],
  };
});

const lastPatch = () => (mockSaveStep.mock.calls[0]?.[0] as { patch: Record<string, unknown> }).patch;

describe('pay type rules', () => {
  it('"No fixed income" stands alone and the rest keep the display order', () => {
    expect(toggledTypes([], 'freelance')).toEqual(['freelance']);
    expect(toggledTypes(['freelance'], 'salary_or_wages')).toEqual(['salary_or_wages', 'freelance']);
    expect(toggledTypes(['salary_or_wages', 'freelance'], 'freelance')).toEqual(['salary_or_wages']);
    expect(toggledTypes(['salary_or_wages'], 'none')).toEqual(['none']);
    expect(toggledTypes(['none'], 'none')).toEqual([]);
    expect(toggledTypes(['none'], 'freelance')).toEqual(['freelance']);
  });

  it('compares answer sets without order', () => {
    expect(sameTypes(['a', 'b'], ['b', 'a'])).toBe(true);
    expect(sameTypes(['a'], ['a', 'b'])).toBe(false);
    expect(sameTypes(['a'], ['b'])).toBe(false);
    expect(sameTypes([], null)).toBe(false);
    expect(sameTypes([], undefined)).toBe(false);
  });

  it('names the first missing part in page order', () => {
    const base = { types: ['salary_or_wages'], hasPay: true, hasBasis: false, amount: null, day: null, countDone: true };
    expect(firstNeed({ ...base, types: [] })).toBe('howPaid');
    expect(firstNeed({ ...base, hasPay: false, hasBasis: true })).toBe('account');
    expect(firstNeed({ ...base, hasPay: false })).toBe('amount');
    expect(firstNeed({ ...base, hasPay: false, amount: 250000 })).toBe('day');
    expect(firstNeed({ ...base, hasPay: false, amount: 250000, day: 15 })).toBe('account');
    expect(firstNeed({ ...base, countDone: false })).toBe('count');
    expect(firstNeed(base)).toBeNull();
  });

  it('finds the largest live income series with no income kind, never a bill, a saving or a stopped one', () => {
    const rows = [
      seriesRow({ id: 'bill', income_kind: null, amount: -9000 }),
      seriesRow({ id: 'kind', income_kind: 'rent', amount: 900000 }),
      seriesRow({ id: 'gone', income_kind: null, amount: 800000, deleted_at: '2026-10-01T00:00:00Z' }),
      seriesRow({ id: 'save', income_kind: null, amount: 700000, saving_mode: 'fixed' }),
      seriesRow({ id: 'goal', income_kind: null, amount: 700000, goal_id: 'g1' }),
      seriesRow({ id: 'ended', income_kind: null, amount: 600000, end_date: '2026-01-01', end_reason: 'stopped' }),
      seriesRow({ id: 'small', income_kind: null, amount: 10000 }),
      seriesRow({ id: 'pay', income_kind: undefined, amount: 320000 }),
      seriesRow({ id: 'less', income_kind: null, amount: 20000 }),
    ];
    expect(unmarkedPaySeries(rows as never)?.id).toBe('pay');
    expect(unmarkedPaySeries([])).toBeNull();
  });
});

describe('PaySetup income types (C-3, GQ4)', () => {
  it('pre-picks "Salary or wages" with found pay and nothing stored, and the no-edit save writes income_types (DC-8)', async () => {
    await wrap(<PaySetup editSeriesFrom={editSeriesFrom} />);
    expect(screen.getByText('How are you paid?')).toBeTruthy();
    expect(screen.getByLabelText('Salary or wages').props.accessibilityState).toMatchObject({ selected: true });
    expect(screen.getByLabelText('Freelance or self-employed').props.accessibilityState).toMatchObject({ selected: false });
    await fireEvent.press(screen.getByText('Save pay details'));
    expect(mockSaveStep).toHaveBeenCalledTimes(1);
    expect(lastPatch()).toEqual({ income_types: ['salary_or_wages'] });
    expect(mockShowToast).toHaveBeenCalledWith(expect.objectContaining({ stepIds: ['step-save'] }));
    expect(mockDismissTo).toHaveBeenCalledWith('/decide/setup');
  });

  it('pre-picks nothing when no pay was found', async () => {
    mockIncome = { ...mockIncome, series: [] };
    await wrap(<PaySetup editSeriesFrom={editSeriesFrom} />);
    for (const label of ['Salary or wages', 'Commission or tips', 'Freelance or self-employed', 'My own business', 'Pension or benefits', 'No fixed income right now']) {
      expect(screen.getByLabelText(label).props.accessibilityState).toMatchObject({ selected: false });
    }
    expect(screen.getByTestId('need-line')).toHaveTextContent('How you’re paid is still needed.');
  });

  it('a stored answer is shown and an unchanged one is not written again', async () => {
    mockIncome = { ...mockIncome, settings: { income_types: ['commission_or_tips'], tax_set_aside_bp: null } };
    await wrap(<PaySetup editSeriesFrom={editSeriesFrom} />);
    expect(screen.getByLabelText('Commission or tips').props.accessibilityState).toMatchObject({ selected: true });
    expect(screen.getByLabelText('Salary or wages').props.accessibilityState).toMatchObject({ selected: false });
    await fireEvent.press(screen.getByText('About the same'));
    await fireEvent.press(screen.getByText('Save pay details'));
    expect(lastPatch()).toEqual({ income_pattern: 'steady', income_pattern_confirmed: true });
  });

  it('unpicking every answer holds Save and says how you are paid is needed; picking freelance shows the set-aside row', async () => {
    await wrap(<PaySetup editSeriesFrom={editSeriesFrom} />);
    expect(screen.queryByTestId('pay-tax-set-aside')).toBeNull();
    expect(screen.queryByTestId('need-line')).toBeNull();
    await fireEvent.press(screen.getByLabelText('Salary or wages'));
    expect(screen.getByTestId('need-line')).toHaveTextContent('How you’re paid is still needed.');
    await fireEvent.press(screen.getByText('Save pay details'));
    expect(mockSaveStep).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByLabelText('Freelance or self-employed'));
    expect(screen.getByTestId('pay-tax-set-aside')).toBeTruthy();
    await fireEvent.press(screen.getByText('Save pay details'));
    expect(lastPatch()).toEqual({ income_types: ['freelance'] });
  });

  it('after the save lands, the setup facts say Pay is done (settingsSourceOf + buildV3Inputs)', () => {
    const source = demoSource('2026-10-28');
    const flags = { noDebts: false, netNotSet: false, noRules: false, billsRight: false };
    const factsWith = (incomeTypes: string[] | null) => {
      const v3 = settingsSourceOf({ settings: { ...EMPTY_DECIDE_SETTINGS, user_id: 'u1', income_types: incomeTypes }, answers: [], dismissals: [], checks: [], planLive: () => true });
      return setupFactsFrom(buildV3Inputs(source, v3), flags, new Map(), new Set());
    };
    const before = factsWith(null);
    expect(before.payAmountMinor).not.toBeNull();
    expect(before.hasPay).toBe(false);
    expect(before.payTypesSet).toBe(false);
    const after = factsWith(['salary_or_wages']);
    expect(after.hasPay).toBe(true);
    expect(after.payTypesSet).toBe(true);
  });
});

describe('PaySetup found pay (A-SU-4)', () => {
  // The audit's miss: 3 monthly arrivals linked to a live income series that was never marked as pay. The records scan skips
  // linked rows (found = null) and the old page looked only for income_kind 'salary', so the page showed empty fields.
  const unmarked = seriesRow({ id: 'acme', name: 'Acme Ltd', income_kind: null, counts_as: null });

  it('shows the unmarked series as found pay, and Save marks it as pay and writes income_types', async () => {
    mockIncome = { ...mockIncome, series: [unmarked], found: null };
    await wrap(<PaySetup editSeriesFrom={editSeriesFrom} />);
    expect(screen.queryByTestId('pay-empty')).toBeNull();
    const card = screen.getByTestId('pay-found');
    expect(card).toHaveTextContent(/Found in Activity/);
    expect(card).toHaveTextContent(/Acme Ltd · \$3,200/);
    expect(card).toHaveTextContent(/15th of each month · Everyday/);
    expect(screen.getByText('That’s right')).toBeTruthy();
    expect(screen.getByText('Change')).toBeTruthy();
    await fireEvent.press(screen.getByText('Save pay details'));
    expect(mockPatch).toHaveBeenCalledWith([{ series: unmarked, attributes: { income_kind: 'salary', counts_as: 'available' } }]);
    expect(mockConfirm).not.toHaveBeenCalled();
    expect(lastPatch()).toEqual({ income_types: ['salary_or_wages'] });
    expect(mockShowToast).toHaveBeenCalledWith(expect.objectContaining({ stepIds: ['step-mark', 'step-save'] }));
  });

  it('keeps a stored counts_as and still saves when the marking writes nothing', async () => {
    mockPatch.mockReturnValueOnce(null);
    mockIncome = { ...mockIncome, series: [{ ...unmarked, counts_as: 'kept' }], settings: { income_types: ['salary_or_wages'] } };
    await wrap(<PaySetup editSeriesFrom={editSeriesFrom} />);
    await fireEvent.press(screen.getByText('Save pay details'));
    expect(mockPatch.mock.calls[0]?.[0]).toEqual([expect.objectContaining({ attributes: { income_kind: 'salary', counts_as: 'kept' } })]);
    expect(mockSaveStep).not.toHaveBeenCalled();
    expect(mockShowToast).toHaveBeenCalledWith(expect.objectContaining({ stepIds: [] }));
  });

  it('a payer found in the records is named on the card and made into a pay series on save', async () => {
    mockIncome = { ...mockIncome, series: [], found: { payer: 'Globex', amount: 280000, day: 25, currency: 'USD', key: 'globex' } };
    await wrap(<PaySetup editSeriesFrom={editSeriesFrom} />);
    expect(screen.getByTestId('pay-found')).toHaveTextContent(/Globex · \$2,800/);
    expect(screen.getByLabelText('Salary or wages').props.accessibilityState).toMatchObject({ selected: true });
    await fireEvent.press(screen.getByText('Save pay details'));
    expect(mockConfirm).toHaveBeenCalledTimes(1);
    expect(lastPatch()).toEqual({ income_types: ['salary_or_wages'] });
  });

  it('a changed found payer is shown under the generic name', async () => {
    mockIncome = { ...mockIncome, series: [], found: { payer: 'Globex', amount: 280000, day: 25, currency: 'USD', key: 'globex' } };
    await wrap(<PaySetup editSeriesFrom={editSeriesFrom} />);
    await fireEvent.press(screen.getByText('Change'));
    await fireEvent.press(screen.getByLabelText('3rd'));
    await fireEvent.press(screen.getByText('Save pay'));
    expect(screen.getByTestId('pay-found')).toHaveTextContent(/Take-home pay · \$2,800/);
    expect(screen.getByTestId('pay-found')).toHaveTextContent(/3rd of each month/);
  });

  it('a found payer with no account to pay into says an account is needed', async () => {
    mockIncome = { ...mockIncome, series: [], accounts: [], found: { payer: 'Globex', amount: 280000, day: 25, currency: 'USD', key: 'globex' } };
    await wrap(<PaySetup editSeriesFrom={editSeriesFrom} />);
    expect(screen.getByTestId('need-line')).toHaveTextContent('An account is still needed.');
  });
});

describe('PaySetup fields (A-SU-4, C-21)', () => {
  beforeEach(() => {
    mockIncome = { ...mockIncome, series: [], settings: { income_types: ['salary_or_wages'] } };
  });

  it('the amount is a boxed field with the currency symbol and the day is picked from a sheet of 31 days', async () => {
    await wrap(<PaySetup editSeriesFrom={editSeriesFrom} />);
    expect(screen.getByTestId('pay-empty')).toBeTruthy();
    expect(screen.getByText('$')).toBeTruthy();
    expect(screen.getByTestId('need-line')).toHaveTextContent('An amount is still needed.');
    await fireEvent.changeText(screen.getByLabelText('How much lands in your account?'), '2500');
    expect(screen.getByTestId('need-line')).toHaveTextContent('A pay day is still needed.');
    expect(screen.getByTestId('day-picker')).toHaveTextContent('No day picked yet');
    await fireEvent.press(screen.getByTestId('day-picker'));
    expect(screen.getByLabelText('1st')).toBeTruthy();
    expect(screen.getByLabelText('31st')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('15th'));
    expect(screen.queryByLabelText('31st')).toBeNull();
    expect(screen.getByTestId('day-picker')).toHaveTextContent('15th');
    expect(screen.queryByTestId('need-line')).toBeNull();
    await fireEvent.press(screen.getByText('Save pay details'));
    expect(mockConfirm).toHaveBeenCalledWith(expect.objectContaining({ series: expect.objectContaining({ amount: 250000, anchor_date: '2026-12-15' }) }));
  });

  it('the day sheet closes on Cancel with no day picked', async () => {
    await wrap(<PaySetup editSeriesFrom={editSeriesFrom} />);
    await fireEvent.press(screen.getByTestId('day-picker'));
    await fireEvent.press(screen.getByText('Cancel'));
    expect(screen.queryByLabelText('31st')).toBeNull();
    expect(screen.getByTestId('day-picker')).toHaveTextContent('No day picked yet');
  });

  it('with no account the line says an account is needed', async () => {
    mockIncome = { ...mockIncome, accounts: [] };
    await wrap(<PaySetup editSeriesFrom={editSeriesFrom} />);
    await fireEvent.changeText(screen.getByLabelText('How much lands in your account?'), '2500');
    await fireEvent.press(screen.getByTestId('day-picker'));
    await fireEvent.press(screen.getByLabelText('15th'));
    expect(screen.getByTestId('need-line')).toHaveTextContent('An account is still needed.');
  });

  it('06.1-65 (FQ4): a typed amount and day + Save and close writes the pay once and leaves', async () => {
    await wrap(<PaySetup editSeriesFrom={editSeriesFrom} />);
    await fireEvent.changeText(screen.getByLabelText('How much lands in your account?'), '2500');
    await fireEvent.press(screen.getByTestId('day-picker'));
    await fireEvent.press(screen.getByLabelText('15th'));
    await fireEvent.press(screen.getByTestId('item-save-close'));
    expect(mockConfirm).toHaveBeenCalledTimes(1);
    expect(mockConfirm).toHaveBeenCalledWith(expect.objectContaining({ series: expect.objectContaining({ amount: 250000, anchor_date: '2026-12-15' }) }));
    expect(mockDismissTo).toHaveBeenCalledTimes(1);
  });

  it('06.1-65 (FQ4): an amount with no day + Save and close stays open and says the day is needed', async () => {
    await wrap(<PaySetup editSeriesFrom={editSeriesFrom} />);
    await fireEvent.changeText(screen.getByLabelText('How much lands in your account?'), '2500');
    await fireEvent.press(screen.getByTestId('item-save-close'));
    expect(mockConfirm).not.toHaveBeenCalled();
    expect(mockDismissTo).not.toHaveBeenCalled();
    expect(screen.getByTestId('need-line')).toHaveTextContent('A pay day is still needed.');
  });

  it('06.1-65: nothing typed + Save and close writes nothing and leaves', async () => {
    await wrap(<PaySetup editSeriesFrom={editSeriesFrom} />);
    await fireEvent.press(screen.getByTestId('item-save-close'));
    expect(mockConfirm).not.toHaveBeenCalled();
    expect(mockSaveStep).not.toHaveBeenCalled();
    expect(mockDismissTo).toHaveBeenCalledTimes(1);
  });
});

describe('PaySetup changing pay (A-SU-4)', () => {
  it('"It changes" shows the four ways, each with a line under it, and Save waits for one', async () => {
    await wrap(<PaySetup editSeriesFrom={editSeriesFrom} />);
    await fireEvent.press(screen.getByText('It changes'));
    for (const sub of [
      'Income counts once it arrives.',
      'A large payment is shared across the months it covers.',
      'A fixed amount counts each month. Anything above it is spare money.',
      'What is in the bank, less the bills coming up.',
    ]) {
      expect(screen.getByText(sub)).toBeTruthy();
    }
    expect(screen.getByTestId('need-line')).toHaveTextContent('A way to count changing pay is still needed.');
    await fireEvent.press(screen.getByLabelText('Match what comes in'));
    expect(screen.queryByTestId('need-line')).toBeNull();
  });
});
