import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { EMPTY_FILTER } from '@/engine/activity';
import { QuickActions } from '../QuickActions';

jest.setTimeout(30000);

const mockNavigate = jest.fn();
const mockPush = jest.fn();
const mockFocus = jest.fn();
const mockOpenEntry = jest.fn();

jest.mock('expo-router', () => ({
  router: {
    navigate: (...a: unknown[]) => mockNavigate(...a),
    push: (...a: unknown[]) => mockPush(...a),
  },
}));
jest.mock('@/state/activityFocus', () => ({
  requestActivityFocus: (...a: unknown[]) => mockFocus(...a),
}));
jest.mock('@/features/record/entry/entryHost', () => ({
  openEntry: (...a: unknown[]) => mockOpenEntry(...a),
}));

async function draw() {
  return render(
    <ThemeProvider>
      <QuickActions month="2026-09" />
    </ThemeProvider>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('QuickActions', () => {
  it('renders three buttons in order with their labels and texts', async () => {
    const { getAllByRole, getByText } = await draw();
    const buttons = getAllByRole('button');
    expect(buttons.map((b) => b.props.accessibilityLabel)).toEqual([
      'Add a transaction',
      'Pay bills, shows unpaid items in Activity',
      'Import a statement',
    ]);
    expect(getByText('Add')).toBeTruthy();
    expect(getByText('Pay bills')).toBeTruthy();
    expect(getByText('Import')).toBeTruthy();
  });

  it('Add opens a new outgoing entry', async () => {
    const { getByLabelText } = await draw();
    await fireEvent.press(getByLabelText('Add a transaction'));
    expect(mockOpenEntry).toHaveBeenCalledWith({ kind: 'new', direction: 'out' });
  });

  it('Pay bills asks Activity to show Unpaid for the month, then navigates', async () => {
    const { getByLabelText } = await draw();
    await fireEvent.press(getByLabelText('Pay bills, shows unpaid items in Activity'));
    expect(mockFocus).toHaveBeenCalledWith({ month: '2026-09', filter: { ...EMPTY_FILTER, unpaidOnly: true } });
    expect(mockNavigate).toHaveBeenCalledWith('/activity');
    expect(mockFocus.mock.invocationCallOrder[0] ?? 0).toBeLessThan(mockNavigate.mock.invocationCallOrder[0] ?? 0);
  });

  it('Import pushes the import route with the literal entry', async () => {
    const { getByLabelText } = await draw();
    await fireEvent.press(getByLabelText('Import a statement'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/import', params: { entry: 'you' } });
  });
});
