/** 05.3-30: How this was worked out, Sam's October. */
import React from 'react';
import { cleanup, fireEvent, screen } from '@testing-library/react-native';
import { wrap } from '../../../check/steps/__tests__/helpers/stepProps';
import { WorkedBody, WorkedScreen } from '../WorkedScreen';
import { NAME_MAP, samEvaluation, samInputs } from './workedKit';

jest.setTimeout(60000);

const mockPush = jest.fn();
jest.mock('../../shared/useV3Format', () => ({ useV3Format: () => jest.requireActual('./workedKit').fakeFormat }));
const mockChecks = jest.fn();
jest.mock('@/data/queries/decide', () => ({ useDecideSnapshot: () => ({ result: null }) }));
jest.mock('@/data/queries/decideCheckV3', () => ({ useChecksV3: () => mockChecks() }));
jest.mock('@/data/queries/recurringSeries', () => ({
  useRecurringSeries: () => ({ data: [{ id: 'rent', name: 'Rent' }, { id: 'phone', name: 'Phone' }, { id: 'gym', name: 'Gym' }] }),
}));
jest.mock('@/features/record/useRecordContext', () => ({ useRecordContext: () => ({ householdId: 'h' }) }));
jest.mock('@/shell/navigation/pushOnce', () => ({ pushOnce: (h: unknown) => mockPush(h) }));
jest.mock('@/shell/screen/DetailScreen', () => {
  const { View: V } = jest.requireActual('react-native');
  return { DetailScreen: ({ children }: { children: React.ReactNode }) => <V>{children}</V> };
});

afterEach(() => {
  cleanup();
  mockPush.mockClear();
});

describe('WorkedScreen', () => {
  it('builds the id to name map from the series data (never raw ids)', async () => {
    mockChecks.mockReturnValue({ home: samEvaluation(), inputs: samInputs() });
    await wrap(<WorkedScreen />);
    expect(screen.getByText('Rent · around the 1')).toBeTruthy();
    expect(screen.queryByText(/^rent/)).toBeNull();
  });
});

describe('WorkedBody', () => {
  it('Sam: the rows, the result equal to monthLeft in accent, and the footer', async () => {
    const ev = samEvaluation();
    await wrap(<WorkedBody evaluation={ev} inputs={samInputs()} names={NAME_MAP} />);
    expect(screen.getByText('Your month, line by line')).toBeTruthy();
    expect(screen.getByText('Pay (regular, d:2026-10-01)')).toBeTruthy();
    expect(screen.getByText('Regular payments (2 confirmed)')).toBeTruthy();
    expect(screen.getByText('Loan minimums')).toBeTruthy();
    expect(screen.getByText('Fixed saving')).toBeTruthy();
    expect(screen.getByText('Everyday so far')).toBeTruthy();
    expect(screen.getByText('Everyday still to come (13 days)')).toBeTruthy();
    expect(screen.getByText('October on track to leave')).toBeTruthy();
    // deductions carry a minus; the pay row does not
    expect(screen.getByText('−$2,000')).toBeTruthy();
    expect(screen.getByText('$4,000')).toBeTruthy();
    const result = screen.getByTestId('worked-result');
    expect(result.props.children).toBe('$425');
    expect(result.props.children).toBe('$' + String(Number((ev as unknown as { month: { monthLeft: number } }).month.monthLeft) / 100));
    expect(screen.getByText(/Worked out from your own records/)).toBeTruthy();
  });

  it('a negative month shows a minus sign', async () => {
    await wrap(<WorkedBody evaluation={samEvaluation({ monthLeft: -12300 })} inputs={samInputs()} names={NAME_MAP} />);
    expect(screen.getByTestId('worked-result').props.children).toBe('−$123');
  });

  it('lists confirmed and unconfirmed regular payments by name', async () => {
    await wrap(<WorkedBody evaluation={samEvaluation()} inputs={samInputs()} names={NAME_MAP} />);
    expect(screen.getByText('Rent · around the 1')).toBeTruthy();
    expect(screen.getByText('Phone · around the 12')).toBeTruthy();
    expect(screen.getByText('Gym · not confirmed, counted as everyday')).toBeTruthy();
    expect(screen.queryByText('No regular payments are confirmed yet.')).toBeNull();
    expect(screen.queryByText('rent')).toBeNull();
  });

  it('no confirmed series: empty text and the button opens the regular-payments step', async () => {
    await wrap(<WorkedBody evaluation={samEvaluation()} inputs={samInputs({ series: [] })} names={NAME_MAP} />);
    expect(screen.getByText('No regular payments are confirmed yet.')).toBeTruthy();
    fireEvent.press(screen.getByText('Confirm regular payments'));
    expect(mockPush).toHaveBeenCalledWith('/decide/setup?only=regular');
  });

  it('the assumptions list has five lines', async () => {
    await wrap(<WorkedBody evaluation={samEvaluation()} inputs={samInputs()} names={NAME_MAP} />);
    expect(screen.getByText('Income counted as your regular pay')).toBeTruthy();
    expect(screen.getByText('Everyday spending continues at your usual pace to d:2026-10-31')).toBeTruthy();
    expect(screen.getByText('Unspent money is the figure you confirmed d:2026-10-02: $1,200')).toBeTruthy();
    expect(screen.getByText(/emergency fund is kept out/)).toBeTruthy();
    expect(screen.getByText(/Payment plans use the rate and fees you entered/)).toBeTruthy();
  });
});
