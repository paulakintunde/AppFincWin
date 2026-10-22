import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { DateField } from '../DateField';

let mockOnChange: ((e: { type: string }, d?: Date) => void) | undefined;
jest.mock('@react-native-community/datetimepicker', () => ({
  __esModule: true,
  default: (props: { onChange: (e: { type: string }, d?: Date) => void }) => {
    mockOnChange = props.onChange;
    return null;
  },
}));
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

async function setup(minDate?: string) {
  const onChange = jest.fn();
  const utils = await render(
    <ThemeProvider>
      <DateField label="Date" value="2026-10-20" display="20 Oct" onChange={onChange} minDate={minDate} />
    </ThemeProvider>
  );
  await fireEvent.press(utils.getByText('20 Oct'));
  return onChange;
}

const noon = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12, 0, 0);

describe('DateField minDate guard', () => {
  beforeEach(() => {
    mockOnChange = undefined;
  });

  it('WR-D12: a day before minDate is refused and the field moves to minDate', async () => {
    const onChange = await setup('2026-10-15');
    await act(async () => mockOnChange!({ type: 'set' }, noon(2026, 10, 14)));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('2026-10-15');
  });

  it('accepts minDate and later days', async () => {
    const onChange = await setup('2026-10-15');
    await act(async () => mockOnChange!({ type: 'set' }, noon(2026, 10, 15)));
    await act(async () => mockOnChange!({ type: 'set' }, noon(2026, 11, 2)));
    expect(onChange).toHaveBeenNthCalledWith(1, '2026-10-15');
    expect(onChange).toHaveBeenNthCalledWith(2, '2026-11-02');
  });

  it('passes any date through without minDate', async () => {
    const onChange = await setup();
    await act(async () => mockOnChange!({ type: 'set' }, noon(2001, 1, 2)));
    expect(onChange).toHaveBeenCalledWith('2001-01-02');
  });

  it('ignores a dismissed event', async () => {
    const onChange = await setup();
    await act(async () => mockOnChange!({ type: 'dismissed' }, noon(2026, 10, 20)));
    expect(onChange).not.toHaveBeenCalled();
  });
});
