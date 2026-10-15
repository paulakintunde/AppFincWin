import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { ActivityMoreMenu } from '../ActivityMoreMenu';

jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@/ui/haptics', () => ({ hapticSelection: jest.fn() }));

jest.setTimeout(30000);

async function setup(props: Partial<React.ComponentProps<typeof ActivityMoreMenu>> = {}) {
  const log: string[] = [];
  const onClose = jest.fn(() => log.push('close'));
  const onSelect = jest.fn((a: string) => log.push(`select:${a}`));
  const utils = await render(
    <ThemeProvider>
      <ActivityMoreMenu visible onClose={onClose} calendar={false} prevMonthName="August" onSelect={onSelect} {...props} />
    </ThemeProvider>
  );
  return { ...utils, onClose, onSelect, log };
}

describe('ActivityMoreMenu', () => {
  it('shows three groups with two dividers', async () => {
    const { getByText, getByLabelText, getAllByTestId } = await setup();
    expect(getByText('More')).toBeTruthy();
    expect(getByLabelText('Select entries')).toBeTruthy();
    expect(getByLabelText(/^Clone August/)).toBeTruthy();
    expect(getByLabelText(/^Paste a list/)).toBeTruthy();
    expect(getByLabelText('Accounts')).toBeTruthy();
    expect(getByLabelText('History')).toBeTruthy();
    expect(getAllByTestId('more-divider')).toHaveLength(2);
  });

  it('omits Select in Calendar and keeps one divider', async () => {
    const { queryByLabelText, getAllByTestId } = await setup({ calendar: true });
    expect(queryByLabelText('Select entries')).toBeNull();
    expect(getAllByTestId('more-divider')).toHaveLength(1);
  });

  it('omits Clone when there is no previous month name', async () => {
    const { queryByLabelText, getByLabelText } = await setup({ prevMonthName: '' });
    expect(queryByLabelText(/^Clone/)).toBeNull();
    expect(getByLabelText(/^Paste a list/)).toBeTruthy();
  });

  it.each([
    ['Select entries', 'select'],
    [/^Clone August/, 'clone'],
    [/^Paste a list/, 'paste'],
    ['Accounts', 'accounts'],
    ['History', 'history'],
  ] as const)('closes then reports %s', async (label, action) => {
    const { getByLabelText, log } = await setup();
    await fireEvent.press(getByLabelText(label));
    expect(log).toEqual(['close', `select:${action}`]);
  });

  it('cancel closes without selecting', async () => {
    const { getByText, onClose, onSelect } = await setup();
    await fireEvent.press(getByText('Cancel'));
    expect(onClose).toHaveBeenCalled();
    expect(onSelect).not.toHaveBeenCalled();
  });
});
