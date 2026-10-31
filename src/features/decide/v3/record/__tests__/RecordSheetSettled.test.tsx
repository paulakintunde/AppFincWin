/** 05.3-74 (UAT gap 9): the sheet writes after the check's saves land, freezes what it wrote, and never shows $0. */
import React from 'react';
import { View } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { RecordSheet } from '../RecordSheet';
import { RecordMutationsContext, type RecordMutations } from '../recordMutations';

jest.setTimeout(60000);

let mockSettled = true;
// lazy: the locale module is read when a test renders, not at import time
const mockStrings = new Proxy({} as Record<string, string>, {
  get: (_t, k: string) => (jest.requireActual('../../../../../i18n/locales/decideV3Ui/record') as { record: Record<string, string> }).record[k],
});

jest.mock('@/ui/Sheet', () => {
  const { View: V } = require('react-native');
  return { Sheet: ({ children }: { children: React.ReactNode }) => <V>{children}</V> };
});
jest.mock('@/i18n', () => ({
  useT: () => (k: string, p?: Record<string, string | number>) =>
    (mockStrings[k.replace('decide.v3.ui.record.', '')] ?? k).replace(/\{\{(\w+)\}\}/g, (_m, n: string) => String(p?.[n] ?? '')),
}));
jest.mock('@/shell/a11yFocus', () => ({ focusAccessibility: jest.fn() }));
jest.mock('@/theme/layout', () => ({ ...jest.requireActual('@/theme/layout'), useScreenInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@/ui/haptics', () => ({ hapticSuccess: jest.fn() }));
jest.mock('@/data/mutations/undo', () => ({ useUndo: () => ({ undo: jest.fn() }) }));
jest.mock('@/features/decide/notifications/waitReminder', () => ({ cancelCheckReminders: () => Promise.resolve() }));
jest.mock('@/features/decide/ui/textFit', () => ({ useShouldStack: () => false }));
jest.mock('@/features/record/useRecordContext', () => ({
  useRecordContext: () => ({ homeCurrency: 'USD', timeZone: 'UTC', today: '2026-10-30' }),
}));
jest.mock('../useBoughtContext', () => ({ useBoughtContext: () => ({ cashAccountId: 'a1', today: '2026-10-30' }) }));
jest.mock('../useCheckWritesSettled', () => ({ useCheckWritesSettled: () => mockSettled }));
jest.mock('../../shared/useV3Format', () => ({
  useV3Format: () => ({ money: (n: number) => `$${(n / 100).toFixed(2)}`, month: (m: string) => m, date: (d: string) => d }),
}));

const mk = (whole: number | null) =>
  ({
    result: { code: 'fits_month', variant: null, legacyState: 'fits', readyBy: null, facts: [] },
    purchase: whole === null ? null : { whole, dayOne: whole, financed: false, schedule: null, categoryId: null },
  }) as never;
const mkRow = (name: string) => ({ id: 'c1', name, created_by: 'u1', household_id: 'h1' }) as never;

function actions(): RecordMutations {
  return {
    canRecordBought: jest.fn(() => true),
    recordBought: jest.fn(() => ({ stepId: 's' })),
    planIt: jest.fn(() => Promise.resolve({ reminder: 'set' as const, stepId: 'sp' as string | null })),
    notBuying: jest.fn(() => 'sn' as string | null),
  };
}

function tree(variant: 'bought' | 'plan' | 'pass', a: RecordMutations, name: string, whole: number | null) {
  return (
    <ThemeProvider>
      <RecordMutationsContext.Provider value={a}>
        <View>
          <RecordSheet variant={variant} visible onClose={jest.fn()} row={mkRow(name)} evaluation={mk(whole)} />
        </View>
      </RecordMutationsContext.Provider>
    </ThemeProvider>
  );
}

beforeEach(() => {
  mockSettled = true;
});

describe('RecordSheet settled gate', () => {
  it('Not buying reads the item and price of the check', async () => {
    await render(tree('pass', actions(), 'Coffee beans', 3000));
    expect(screen.getByText('Nothing is spent. $30.00 stays where it is.')).toBeTruthy();
    expect(screen.getByText('Check saved as ‘Not buying’ · Coffee beans')).toBeTruthy();
  });

  for (const variant of ['plan', 'pass'] as const) {
    it(`${variant} does not write while a save is pending, then writes once`, async () => {
      mockSettled = false;
      const a = actions();
      const view = await render(tree(variant, a, 'Coffee beans', 3000));
      expect(a.planIt).not.toHaveBeenCalled();
      expect(a.notBuying).not.toHaveBeenCalled();
      mockSettled = true;
      await view.rerender(tree(variant, a, 'Coffee beans', 3000));
      await view.rerender(tree(variant, a, 'Coffee beans', 3000));
      expect(variant === 'plan' ? a.planIt : a.notBuying).toHaveBeenCalledTimes(1);
    });
  }

  it('keeps showing what was written when the row and evaluation change underneath', async () => {
    const a = actions();
    const view = await render(tree('pass', a, 'Coffee beans', 3000));
    await view.rerender(tree('pass', a, 'C', null));
    expect(screen.getByText('Nothing is spent. $30.00 stays where it is.')).toBeTruthy();
    expect(screen.getByText('Check saved as ‘Not buying’ · Coffee beans')).toBeTruthy();
  });

  it('with no price never shows $0', async () => {
    await render(tree('pass', actions(), 'Coffee beans', null));
    expect(screen.getByText('Nothing is spent.')).toBeTruthy();
    expect(screen.queryByText(/\$0/)).toBeNull();
  });

  it('the plan line has no price when none is known', async () => {
    await render(tree('plan', actions(), 'Coffee beans', null));
    expect(screen.getByText('Plan: Coffee beans')).toBeTruthy();
    expect(screen.queryByText(/\$0/)).toBeNull();
  });

  it('bought step A disables the confirm while not settled', async () => {
    mockSettled = false;
    const a = actions();
    await render(tree('bought', a, 'Sofa', 120000));
    await fireEvent.press(screen.getByText(mockStrings.confirm!));
    expect(a.recordBought).not.toHaveBeenCalled();
  });
});
