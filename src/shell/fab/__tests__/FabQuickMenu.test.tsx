import React, { useEffect } from 'react';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { renderWithShellProviders, resetShellStores } from '@/shell/__tests__/testUtils';
import { FabProvider, useFab, useProvideQuickAction, type FabContextValue } from '../FabProvider';
import { FabQuickMenu } from '../FabQuickMenu';

jest.mock('@/features/auth/AuthProvider', () => ({
  useAuth: () => ({ status: 'signedIn' }),
}));
jest.mock('expo-router', () => ({
  useFocusEffect: (cb: () => void | (() => void)) => {
    const { useEffect: ue } = jest.requireActual<typeof import('react')>('react');
    ue(cb, [cb]);
  },
}));

const holder: { current: FabContextValue | null } = { current: null };
function Probe(): null {
  const value = useFab();
  useEffect(() => {
    holder.current = value;
  });
  return null;
}
function Quick({ id, fn }: { id: 'addExpense' | 'importStatement'; fn: () => void }): null {
  useProvideQuickAction(id, fn);
  return null;
}

const expense = jest.fn();
const importFn = jest.fn();

async function setup(): Promise<void> {
  await renderWithShellProviders(
    <FabProvider>
      <Probe />
      <Quick id="importStatement" fn={importFn} />
      <Quick id="addExpense" fn={expense} />
      <FabQuickMenu />
    </FabProvider>,
  );
}
async function open(): Promise<void> {
  await act(async () => {
    holder.current?.openQuickMenu();
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  resetShellStores();
  holder.current = null;
});

describe('FabQuickMenu', () => {
  it('renders nothing while closed', async () => {
    await setup();
    expect(screen.queryByText('Quick add')).toBeNull();
  });

  it('lists registered entries in D-11 order as buttons', async () => {
    await setup();
    await open();
    expect(screen.getAllByText('Quick add', { hidden: true }).length).toBeGreaterThan(0);
    const rows = screen.getAllByTestId('row-root', { hidden: true });
    expect(rows).toHaveLength(2);
    expect(screen.getByText('Add expense', { hidden: true })).toBeTruthy();
    expect(screen.getByText('Import statement', { hidden: true })).toBeTruthy();
    const labels = rows.map((r) => r.props.accessibilityLabel);
    expect(labels).toEqual(['Add expense', 'Import statement']);
    expect(rows[0]?.props.accessibilityRole).toBe('button');
  });

  it('closes first and runs the chosen action on the next frame, once', async () => {
    jest.useFakeTimers();
    try {
      await setup();
      await open();
      await fireEvent.press(screen.getByText('Add expense', { hidden: true }));
      expect(holder.current?.quickMenuOpen).toBe(false);
      expect(expense).not.toHaveBeenCalled();
      await act(async () => {
        jest.advanceTimersByTime(50);
      });
      expect(expense).toHaveBeenCalledTimes(1);
      expect(importFn).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it('backdrop dismiss closes without running anything', async () => {
    jest.useFakeTimers();
    try {
      await setup();
      await open();
      await fireEvent.press(screen.getByTestId('sheet-backdrop', { hidden: true }));
      expect(holder.current?.quickMenuOpen).toBe(false);
      await act(async () => {
        jest.advanceTimersByTime(50);
      });
      expect(expense).not.toHaveBeenCalled();
      expect(importFn).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it('labels the sheet and Cancel closes without running anything', async () => {
    await setup();
    await open();
    expect(screen.getByTestId('sheet-container', { hidden: true }).props.accessibilityLabel).toBe(
      'Quick add',
    );
    await fireEvent.press(screen.getByLabelText('Cancel', { hidden: true }));
    expect(holder.current?.quickMenuOpen).toBe(false);
    expect(expense).not.toHaveBeenCalled();
  });
});
