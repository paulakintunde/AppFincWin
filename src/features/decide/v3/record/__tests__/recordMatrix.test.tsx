/** 05.3-27: the bought record sheet at 320 / 402 wide x 1.0x / 2.0x. Buttons stack under rule S, targets reach 44, text fits. */
import React from 'react';
import { StyleSheet } from 'react-native';
import { cleanup, render, screen } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { MATRIX, allNodes, expectFits, expectTargets, matrixName } from '../../../__tests__/helpers/r18Fit';
import { RecordSheet } from '../RecordSheet';
import { RecordMutationsContext, type RecordMutations } from '../recordMutations';

jest.setTimeout(60000);

let mockWidth = 402;
let mockScale = 1;

jest.mock('@/ui/Sheet', () => {
  const { View: V } = require('react-native');
  return { Sheet: ({ children }: { children: React.ReactNode }) => <V>{children}</V> };
});
jest.mock('@/i18n', () => ({ useT: () => (k: string) => k.replace('decide.v3.ui.record.', '') }));
jest.mock('@/shell/a11yFocus', () => ({ focusAccessibility: jest.fn() }));
jest.mock('@/theme/layout', () => ({ ...jest.requireActual('@/theme/layout'), useScreenInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@/ui/haptics', () => ({ hapticSuccess: jest.fn() }));
jest.mock('@/data/mutations/undo', () => ({ useUndo: () => ({ undo: jest.fn() }) }));
jest.mock('@/features/decide/notifications/waitReminder', () => ({ cancelCheckReminders: () => Promise.resolve() }));
jest.mock('@/features/decide/ui/textFit', () => ({
  useShouldStack: () => (jest.requireActual('@/features/decide/ui/textFit') as typeof import('@/features/decide/ui/textFit')).shouldStack({ width: mockWidth, fontScale: mockScale }),
}));
jest.mock('@/features/record/useRecordContext', () => ({
  useRecordContext: () => ({ homeCurrency: 'USD', timeZone: 'UTC', today: '2026-10-30' }),
}));
jest.mock('../useBoughtContext', () => ({ useBoughtContext: () => ({ cashAccountId: 'a1', today: '2026-10-30' }) }));
jest.mock('../../shared/useV3Format', () => ({
  useV3Format: () => ({ money: (n: number) => `$${n / 100}`, month: (m: string) => m, date: (d: string) => d }),
}));

const evaluation = {
  result: {
    code: 'fits_month',
    variant: null,
    legacyState: 'fits',
    readyBy: null,
    facts: [{ code: 'unspent_before_after', values: { before: 1, after: 50_000 } }],
  },
  purchase: { whole: 120_000, dayOne: 120_000, financed: false, schedule: null, categoryId: null },
} as never;
const row = { id: 'c1', name: 'Sofa', created_by: 'u1', household_id: 'h1' } as never;
const actions: RecordMutations = {
  canRecordBought: () => true,
  recordBought: () => ({ stepId: 's' }),
  planIt: () => Promise.resolve({ reminder: 'set', stepId: 's-plan' }),
  notBuying: () => 's-pass',
};

const stretched = (): number =>
  allNodes().filter((n) => n.type === 'View' && (StyleSheet.flatten(n.props.style) as { alignSelf?: string } | undefined)?.alignSelf === 'stretch').length;

describe('record sheet matrix', () => {
  for (const m of MATRIX) {
    it(`bought step A at ${matrixName(m)}`, async () => {
      mockWidth = m.width;
      mockScale = m.scale;
      await render(
        <ThemeProvider>
          <RecordMutationsContext.Provider value={actions}>
            <RecordSheet variant="bought" visible onClose={jest.fn()} row={row} evaluation={evaluation} />
          </RecordMutationsContext.Provider>
        </ThemeProvider>
      );
      expectFits();
      expectTargets('notYet', 'confirm');
      expect(screen.getByText('lineItem')).toBeTruthy();
      // rule S: under 360 wide or past 1.3x the two buttons stack
      expect(stretched()).toBe(m.width < 360 || m.scale > 1.3 ? 2 : 0);
      await cleanup();
    });
  }
});
