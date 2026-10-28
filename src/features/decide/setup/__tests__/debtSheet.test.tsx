// 05.2-43 (DSU-06): the loan and card sheet: edit, add, validation, Paid off, status line, text fit, gating.
import React from 'react';
import { act, fireEvent, screen } from '@testing-library/react-native';
import type { DebtRow } from '@/db/debts';
import { wrap } from '../../check/steps/__tests__/helpers/stepProps';
import { DebtSheetHost, parseRate, storedKindOf } from '../DebtSheet';
import { openDebtSheet, resetDebtSheetForTests } from '../debtSheetHost';

jest.setTimeout(30000);
let mockWidth = 402;
let mockScale = 1;
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: mockWidth, height: 874, scale: 2, fontScale: mockScale }),
}));
jest.mock('@/ui/haptics', () => ({ hapticSelection: jest.fn(), hapticLight: jest.fn(), hapticWarning: jest.fn(), hapticSuccess: jest.fn(), hapticMedium: jest.fn() }));

const mockAdd = jest.fn((_i: Record<string, unknown>) => ({ id: 'new-1', stepId: 'step-add' }));
const mockEdit = jest.fn((_d: unknown, _p: unknown, _o: unknown) => 'step-edit');
const mockPaidOff = jest.fn((_d: unknown, _date: unknown, _o: unknown) => 'step-paid');
const mockToast = jest.fn();
jest.mock('@/data/mutations/debts', () => ({
  useAddDebt: () => ({ add: (i: Record<string, unknown>) => mockAdd(i) }),
  useEditDebt: () => ({ edit: (d: unknown, p: unknown, o: unknown) => mockEdit(d, p, o) }),
  useSetDebtPaidOff: () => ({ setPaidOff: (d: unknown, date: unknown, o: unknown) => mockPaidOff(d, date, o) }),
}));
jest.mock('@/state/undoToast', () => ({ showToast: (t: unknown) => mockToast(t) }));
let mockV3 = true;
jest.mock('@/features/decide/useDecideAccess', () => ({ useDecideAccess: () => ({ v3: mockV3 }) }));
jest.mock('@/features/record/useRecordContext', () => ({
  useRecordContext: () => ({ userId: 'u1', householdId: 'h1', homeCurrency: 'USD', today: '2026-10-28', timeZone: 'UTC', showCents: false }),
}));

const debt = (over: Partial<DebtRow> = {}): DebtRow => ({
  id: 'd1',
  household_id: 'h1',
  account_id: null,
  check_id: null,
  series_id: null,
  name: 'Visa',
  kind: 'card',
  currency: 'USD',
  balance: 120000,
  apr: '21.9',
  minimum_payment: 2500,
  secured: false,
  term_months: null,
  start_date: null,
  min_percent: null,
  min_interest_added: null,
  min_floor: null,
  paid_in_full: false,
  pays_in_full: null,
  paid_off_on: null,
  is_housing: false,
  is_sample: false,
  deleted_at: null,
  version: 3,
  updated_by: null,
  created_at: '2026-10-01T00:00:00Z',
  updated_at: '2026-10-01T00:00:00Z',
  ...over,
});

/** Every value of one prop in the rendered tree (a walk over children only, so provider objects are not followed). */
function propsOf(node: unknown, prop: string): unknown[] {
  if (node === null || typeof node !== 'object') return [];
  if (Array.isArray(node)) return node.flatMap((n) => propsOf(n, prop));
  const n = node as { props?: Record<string, unknown>; children?: unknown };
  const own = n.props && prop in n.props ? [n.props[prop]] : [];
  return [...own, ...propsOf(n.children, prop)];
}

async function typeMoney(label: string, text: string) {
  const field = screen.getByLabelText(label);
  await fireEvent.changeText(field, text);
  await fireEvent(field, 'blur');
}

async function open(req: Parameters<typeof openDebtSheet>[0]) {
  await wrap(<DebtSheetHost />, mockScale);
  await act(async () => {
    openDebtSheet(req);
  });
}

beforeEach(() => {
  mockWidth = 402;
  mockScale = 1;
  mockV3 = true;
  [mockAdd, mockEdit, mockPaidOff, mockToast].forEach((m) => m.mockClear());
  resetDebtSheetForTests();
});

describe('helpers', () => {
  it('maps kind choices to stored kinds', () => {
    expect(['card', 'car', 'student', 'personal', 'mortgage', 'bnpl', 'other'].map((k) => storedKindOf(k as never))).toEqual([
      'card', 'loan', 'loan', 'loan', 'loan', 'other', 'other',
    ]);
  });
  it('parses the rate', () => {
    expect(parseRate('19.99')).toBe('19.99');
    expect(parseRate('')).toBeNull();
    expect(parseRate('100')).toBe('100');
    expect(parseRate('100.01')).toBe('invalid');
    expect(parseRate('1.234')).toBe('invalid');
    expect(parseRate('abc')).toBe('invalid');
  });
});

describe('DebtSheet edit', () => {
  it('prefills from the debt and keeps Save off until something changes', async () => {
    await open({ mode: 'edit', debt: debt() });
    expect(screen.getByText('Visa')).toBeTruthy();
    expect(screen.getByLabelText('Name').props.value).toBe('Visa');
    expect(screen.getByLabelText('Interest rate, percent a year').props.value).toBe('21.9');
    expect(screen.getByLabelText('Save').props.accessibilityState?.disabled).toBe(true);
    await fireEvent.changeText(screen.getByLabelText('Interest rate, percent a year'), '19.99');
    expect(screen.getByLabelText('Save').props.accessibilityState?.disabled).toBeFalsy();
  });

  it('saves only the changed fields, toasts with the debtEdited Undo label and closes', async () => {
    const d = debt();
    await open({ mode: 'edit', debt: d });
    await fireEvent.changeText(screen.getByLabelText('Interest rate, percent a year'), '19.99');
    await typeMoney('Balance', '900');
    await fireEvent.press(screen.getByLabelText('Save'));
    expect(mockEdit).toHaveBeenCalledWith(d, { balance: 90000, apr: '19.99' }, 'u1');
    expect(mockToast).toHaveBeenCalledWith({
      kind: 'destructive',
      text: { key: 'decide.setup.debtSheet.savedToast', params: { undoLabel: 'debtEdited', name: 'Visa' } },
      stepId: 'step-edit',
    });
    expect(screen.queryByLabelText('Name')).toBeNull();
  });

  it('shows the pays-in-full chips for a card only', async () => {
    await open({ mode: 'edit', debt: debt() });
    expect(screen.getByText('Sometimes')).toBeTruthy();
    await act(async () => resetDebtSheetForTests());
    await act(async () => openDebtSheet({ mode: 'edit', debt: debt({ id: 'd2', kind: 'loan', name: 'Auto' }) }));
    expect(screen.queryByText('Sometimes')).toBeNull();
  });

  it('refuses a rate above 100 and an empty name', async () => {
    await open({ mode: 'edit', debt: debt() });
    await fireEvent.changeText(screen.getByLabelText('Interest rate, percent a year'), '101');
    expect(screen.getByText('Rate is between 0 and 100.')).toBeTruthy();
    expect(screen.getByLabelText('Save').props.accessibilityState?.disabled).toBe(true);
    await fireEvent.changeText(screen.getByLabelText('Interest rate, percent a year'), '20');
    await fireEvent.changeText(screen.getByLabelText('Name'), '  ');
    expect(screen.getByText('A name is needed.')).toBeTruthy();
    expect(screen.getByLabelText('Save').props.accessibilityState?.disabled).toBe(true);
  });
});

describe('DebtSheet add', () => {
  it('prefills the kind label, inserts a loan secured for a car, and toasts debtAdded', async () => {
    await open({ mode: 'add', kind: 'car' });
    expect(screen.getByText('Add a loan or card')).toBeTruthy();
    expect(screen.getByLabelText('Name').props.value).toBe('Car loan');
    expect(screen.getByLabelText('Save').props.accessibilityState?.disabled).toBe(true);
    await typeMoney('Balance', '8000');
    await typeMoney('Minimum payment each month', '200');
    await fireEvent.changeText(screen.getByLabelText('Interest rate, percent a year'), '5.5');
    await fireEvent.press(screen.getByLabelText('Save'));
    expect(mockAdd).toHaveBeenCalledWith({
      householdId: 'h1',
      ownerId: 'u1',
      row: expect.objectContaining({
        name: 'Car loan',
        kind: 'loan',
        secured: true,
        currency: 'USD',
        balance: 800000,
        minimum_payment: 20000,
        apr: '5.5',
        paid_in_full: false,
        pays_in_full: null,
      }),
    });
    expect(mockToast).toHaveBeenCalledWith({
      kind: 'destructive',
      text: { key: 'decide.setup.debtSheet.savedToast', params: { undoLabel: 'debtAdded', name: 'Car loan' } },
      stepId: 'step-add',
    });
  });

  it('a card takes its pays-in-full answer; buy now pay later is stored as other and not secured', async () => {
    await open({ mode: 'add', kind: 'card' });
    expect(screen.getByLabelText('Name').props.value).toBe('Credit card');
    await typeMoney('Balance', '100');
    await typeMoney('Minimum payment each month', '10');
    await fireEvent.press(screen.getByText('Sometimes'));
    await fireEvent.press(screen.getByLabelText('Save'));
    expect(mockAdd.mock.calls[0]![0]).toMatchObject({ row: { kind: 'card', secured: false, pays_in_full: 'sometimes' } });
    await act(async () => resetDebtSheetForTests());
    await act(async () => openDebtSheet({ mode: 'add', kind: 'bnpl' }));
    await typeMoney('Balance', '100');
    await typeMoney('Minimum payment each month', '10');
    await fireEvent.press(screen.getByLabelText('Save'));
    expect(mockAdd.mock.calls[1]![0]).toMatchObject({ row: { kind: 'other', secured: false, pays_in_full: null } });
  });

  it('never offers Paid off in add mode', async () => {
    await open({ mode: 'add', kind: 'personal' });
    expect(screen.queryByText('Paid off')).toBeNull();
  });
});

describe('DebtSheet Paid off', () => {
  it('opens a date row defaulting to today and saves it with the debtPaidOff Undo label', async () => {
    const d = debt();
    await open({ mode: 'edit', debt: d });
    await fireEvent.press(screen.getByText('Paid off'));
    expect(screen.getByText('Paid off on')).toBeTruthy();
    expect(screen.getByText('Oct 28, 2026')).toBeTruthy();
    expect(screen.getByText('Decide stops counting its minimum payment from this date. Past months stay as recorded.')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Paid off'));
    expect(mockPaidOff).toHaveBeenCalledWith(d, '2026-10-28', 'u1');
    expect(mockEdit).not.toHaveBeenCalled();
    expect(mockToast).toHaveBeenCalledWith({
      kind: 'destructive',
      text: { key: 'decide.setup.debtSheet.paidOffToast', params: { undoLabel: 'debtPaidOff', name: 'Visa' } },
      stepId: 'step-paid',
    });
    expect(screen.queryByLabelText('Name')).toBeNull();
  });

  it('refuses a date after today', async () => {
    await open({ mode: 'edit', debt: debt() });
    await fireEvent.press(screen.getByText('Paid off'));
    const picker = screen.getByText('Oct 28, 2026');
    await fireEvent.press(picker);
    await fireEvent(screen.getByTestId('date-picker'), 'onChange', { nativeEvent: { timestamp: new Date(2026, 10, 3, 12).getTime() } });
    expect(screen.getByText('This date is after today.')).toBeTruthy();
    expect(screen.getByLabelText('Paid off').props.accessibilityState?.disabled).toBe(true);
    await fireEvent.press(screen.getByLabelText('Paid off'));
    expect(mockPaidOff).not.toHaveBeenCalled();
  });

  it('shows "Paid off {date}" with no action for a debt already paid off', async () => {
    await open({ mode: 'edit', debt: debt({ paid_off_on: '2026-09-15' }) });
    const line = screen.getByText('Paid off Sep 15, 2026');
    expect(line).toBeTruthy();
    expect(screen.getByLabelText('Visa, paid off Sep 15, 2026')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Paid off' })).toBeNull();
  });
});

describe('DebtSheet gating and fit', () => {
  it('renders nothing without the new Decide', async () => {
    mockV3 = false;
    await open({ mode: 'edit', debt: debt() });
    expect(screen.queryByLabelText('Name')).toBeNull();
  });

  it.each([
    [320, 1],
    [320, 2],
    [402, 1],
    [402, 2],
  ])('stacks every field in one column at %i dp and font scale %i, with no clipping props', async (width, scale) => {
    mockWidth = width;
    mockScale = scale;
    await open({ mode: 'edit', debt: debt({ name: 'A very long loan name that keeps going past a line', balance: 99999999999 }) });
    await fireEvent.press(screen.getByText('Paid off'));
    expect(propsOf(screen.toJSON(), 'numberOfLines')).toEqual([]);
    for (const label of ['Name', 'Balance', 'Interest rate, percent a year', 'Minimum payment each month']) {
      expect(screen.getByLabelText(label)).toBeTruthy();
    }
    expect(screen.getByText('Paid off on')).toBeTruthy();
  });
});
