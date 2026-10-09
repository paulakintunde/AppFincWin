import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { CloneMonthSheet, previousMonth } from '../CloneMonthSheet';

jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const mockClone = jest.fn();
jest.mock('@/data/mutations/cloneMonth', () => ({ useCloneMonth: () => ({ clone: mockClone }) }));
jest.mock('@/features/record/useRecordContext', () => ({
  useRecordContext: () => ({
    ready: true,
    userId: 'u1',
    householdId: 'h1',
    homeCurrency: 'GBP',
    showCents: true,
    region: 'GB',
    timeZone: 'Europe/London',
    today: '2026-10-09',
    weekStart: 1,
    horizonMonth: null,
  }),
}));

function row(id: string, name: string, date: string, amount: number, extra: Record<string, unknown> = {}) {
  return {
    id,
    name,
    local_date: date,
    original_amount: amount,
    original_currency: 'GBP',
    category_id: null,
    account_id: 'a1',
    payment_type: null,
    recurring_series_id: null,
    transfer_id: null,
    status: 'paid',
    is_refund: false,
    ...extra,
  };
}

let mockPrevRows: unknown[] = [];
let mockCurrentRows: unknown[] = [];
jest.mock('@/data/queries/activity', () => ({
  useMonthView: (_ctx: unknown, month: string) => ({
    rows: month === '2026-09' ? mockPrevRows : mockCurrentRows,
  }),
}));

jest.setTimeout(30000);

async function show() {
  const onClose = jest.fn();
  const utils = await render(
    <ThemeProvider>
      <CloneMonthSheet visible targetMonth="2026-10" onClose={onClose} />
    </ThemeProvider>
  );
  return { ...utils, onClose };
}

beforeEach(() => {
  mockClone.mockReset();
  mockPrevRows = [
    row('1', 'Gym', '2026-09-03', -3000),
    row('2', 'Haircut', '2026-09-15', -2500),
    row('3', 'Vet', '2026-09-30', -9000),
    row('4', 'Rent', '2026-09-01', -90000, { recurring_series_id: 's1' }),
  ];
  mockCurrentRows = [];
});

describe('previousMonth', () => {
  it('wraps the year', () => {
    expect(previousMonth('2026-01')).toBe('2025-12');
    expect(previousMonth('2026-10')).toBe('2026-09');
  });
});

describe('CloneMonthSheet', () => {
  it('lists one-off lines ticked, with a count CTA', async () => {
    const { getByText, getAllByRole } = await show();
    expect(getByText('Clone from September 2026')).toBeTruthy();
    const boxes = getAllByRole('checkbox');
    expect(boxes).toHaveLength(3);
    expect(boxes.every((b) => b.props.accessibilityState.checked === true)).toBe(true);
    expect(getByText('Clone 3 lines')).toBeTruthy();
  });

  it('unticking lowers the count and clones only ticked lines', async () => {
    const { getByText, getByLabelText, onClose } = await show();
    await fireEvent.press(getByLabelText('Clone Haircut'));
    await fireEvent.press(getByText('Clone 2 lines'));
    expect(mockClone).toHaveBeenCalledTimes(1);
    const arg = mockClone.mock.calls[0][0];
    expect(arg.candidates.map((c: { name: string }) => c.name)).toEqual(['Gym', 'Vet']);
    expect(arg.month).toBe('2026-10');
    expect(onClose).toHaveBeenCalled();
  });

  it('skips names already in the month', async () => {
    mockCurrentRows = [row('9', 'gym', '2026-10-02', -3000)];
    const { getByText } = await show();
    expect(getByText('Clone 2 lines')).toBeTruthy();
  });

  it('shows the none copy and a disabled CTA with no candidates', async () => {
    mockPrevRows = [];
    const { getByText, getByLabelText } = await show();
    expect(getByText(/^Nothing from September 2026 to clone/)).toBeTruthy();
    expect(getByLabelText('Clone 0 lines').props.accessibilityState?.disabled).toBe(true);
  });
});
