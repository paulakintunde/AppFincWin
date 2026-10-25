import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import type { DebtRow } from '@/db/debts';
import type { DecideSettingsRow } from '@/db/decideSettings';
import { loggedSource } from '../../snapshot/__tests__/helpers/snapshotFixtures';
import { wrap } from '../../check/steps/__tests__/helpers/stepProps';
import { LinesCard } from '../LinesCard';
import { DebtHousingSwitch, LoansCountedAsHousing } from '../DebtHousingSwitch';

jest.setTimeout(30000);

const mockSetHousing = jest.fn((..._a: unknown[]) => 'step-1');
const mockShowToast = jest.fn();
let mockDebts: DebtRow[] = [];
jest.mock('@/data/mutations/debts', () => ({ useSetDebtHousing: () => ({ setHousing: (...a: unknown[]) => mockSetHousing(...a) }) }));
jest.mock('@/data/queries/decide', () => ({ useDebts: () => ({ data: mockDebts }) }));
jest.mock('@/data/mutations/decideSettings', () => ({ useUpdateDecideSettings: () => ({ update: jest.fn() }) }));
jest.mock('@/features/record/useRecordContext', () => ({ useRecordContext: () => ({ userId: 'u1', householdId: 'h1' }) }));
jest.mock('@/state/undoToast', () => ({ showToast: (...a: unknown[]) => mockShowToast(...a) }));
jest.mock('@/ui/haptics', () => ({ hapticSelection: jest.fn(), hapticLight: jest.fn(), hapticWarning: jest.fn(), hapticSuccess: jest.fn(), hapticMedium: jest.fn() }));

const whole = (n: number) => `$${Math.round(n / 100)}`;

function debt(id: string, over: Partial<DebtRow> = {}): DebtRow {
  return {
    id,
    household_id: 'h1',
    account_id: null,
    check_id: null,
    series_id: null,
    name: `Loan ${id}`,
    kind: 'loan',
    currency: 'USD',
    balance: 20_000_000,
    apr: null,
    minimum_payment: 120_000,
    secured: true,
    term_months: null,
    start_date: null,
    min_percent: null,
    min_interest_added: null,
    min_floor: null,
    paid_in_full: false,
    is_housing: false,
    is_sample: false,
    deleted_at: null,
    version: 3,
    updated_by: null,
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-01T00:00:00Z',
    ...over,
  };
}

const settings = { user_id: 'u1', currency: 'USD', housing_line: null } as unknown as DecideSettingsRow;

beforeEach(() => {
  jest.clearAllMocks();
  mockDebts = [];
});

describe('DebtHousingSwitch and the Loans counted as housing section', () => {
  it('D-103 each live loan has a This is for housing switch with the specified a11y', async () => {
    mockDebts = [debt('a', { name: 'Home loan', is_housing: true }), debt('b', { name: 'Car loan' })];
    await wrap(<LoansCountedAsHousing whole={whole} userId="u1" />);
    expect(screen.getByRole('header', { name: 'Loans counted as housing' })).toBeTruthy();
    expect(screen.getByText('A loan with this on counts toward the housing line.')).toBeTruthy();
    expect(screen.getByText('Home loan')).toBeTruthy();
    expect(screen.getAllByText('$1200 a month')).toHaveLength(2);
    const on = screen.getByLabelText('This is for housing, Home loan');
    expect(on.props.accessibilityRole).toBe('switch');
    expect(on.props.accessibilityState.checked).toBe(true);
    expect(on.props.accessibilityHint).toBe('Counts this loan toward the housing line');
    const off = screen.getByLabelText('This is for housing, Car loan');
    expect(off.props.accessibilityState.checked).toBe(false);
    expect(screen.getAllByText('This is for housing')).toHaveLength(2);
    const flat = (Array.isArray(on.props.style) ? on.props.style.flat() : [on.props.style]) as { minHeight?: number }[];
    expect(flat.find((x) => x?.minHeight !== undefined)?.minHeight).toBeGreaterThanOrEqual(44);
  });

  it('D-103 a card debt never gets the switch', async () => {
    mockDebts = [debt('c', { name: 'Visa', kind: 'card' }), debt('x', { name: 'Old loan', deleted_at: '2026-10-02T00:00:00Z' }), debt('l', { name: 'Kept' })];
    await wrap(<LoansCountedAsHousing whole={whole} userId="u1" />);
    expect(screen.queryByLabelText('This is for housing, Visa')).toBeNull();
    expect(screen.queryByLabelText('This is for housing, Old loan')).toBeNull();
    expect(screen.getByLabelText('This is for housing, Kept')).toBeTruthy();
  });

  it('D-103 with no loans the section reads the empty line', async () => {
    mockDebts = [debt('c', { name: 'Visa', kind: 'card' })];
    await wrap(<LoansCountedAsHousing whole={whole} userId="u1" />);
    expect(screen.getByText('Loans counted as housing')).toBeTruthy();
    expect(screen.getByText('No loans recorded yet. A loan from a check appears here.')).toBeTruthy();
    expect(screen.queryByText('A loan with this on counts toward the housing line.')).toBeNull();
    expect(screen.queryByText('This is for housing')).toBeNull();
  });

  it('D-103 toggling calls useSetDebtHousing', async () => {
    const d = debt('a', { name: 'Home loan' });
    mockDebts = [d];
    await wrap(<LoansCountedAsHousing whole={whole} userId="u1" />);
    await fireEvent.press(screen.getByLabelText('This is for housing, Home loan'));
    expect(mockSetHousing).toHaveBeenCalledTimes(1);
    expect(mockSetHousing).toHaveBeenCalledWith(d, true, 'u1');
  });

  it('D-103 flipping the switch shows Housing setting changed with Undo, and Undo restores it', async () => {
    const d = debt('a', { name: 'Home loan', is_housing: true });
    await wrap(<DebtHousingSwitch debt={d} ownerId="u1" whole={whole} />);
    await fireEvent.press(screen.getByLabelText('This is for housing, Home loan'));
    expect(mockSetHousing).toHaveBeenCalledWith(d, false, 'u1');
    // The toast host replays this step id on Undo (the undo engine restores `before`, tested in the debts mutation suite).
    expect(mockShowToast).toHaveBeenCalledWith({ kind: 'ordinary', text: { key: 'undo.label.debtHousingChanged', params: {} }, stepId: 'step-1' });
  });

  it('D-103 a long loan name wraps and is never clamped', async () => {
    const name = 'Mortgage on the house by the lake with the very long official name that must wrap rather than clip';
    mockDebts = [debt('a', { name })];
    await wrap(<LoansCountedAsHousing whole={whole} userId="u1" />);
    expect(screen.getByText(name).props.numberOfLines).toBeUndefined();
    expect(screen.getByLabelText(`This is for housing, ${name}`)).toBeTruthy();
  });

  it('D-103 the housing editor info line shows housingMonthly and its share of money in', async () => {
    const source = loggedSource({ housingMonthly: 150_000 as never }); // income basis 500_000
    await wrap(<LinesCard source={source} settings={settings} userId="u1" currency="USD" whole={whole} flat />);
    await fireEvent.press(screen.getByTestId('line-row-housing'));
    expect(screen.getByText('Your housing costs come to $1500 a month, 30% of money in.')).toBeTruthy();
    expect(screen.getByText('Loans counted as housing')).toBeTruthy();
  });
});
