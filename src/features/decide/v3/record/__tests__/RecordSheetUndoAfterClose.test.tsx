/** 05.3-101 (UAT gap 25): a record sheet that closes after a write without its Undo leaves one Undo toast for that write. */
import React from 'react';
import { AccessibilityInfo, View } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { RecordSheet } from '../RecordSheet';
import { RecordMutationsContext, type RecordMutations } from '../recordMutations';

jest.setTimeout(60000);

const mockUndo = jest.fn();
const mockToast = jest.fn();

jest.mock('@/ui/Sheet', () => {
  const { View: V, Pressable: P, Text: T } = require('react-native');
  return {
    Sheet: ({ children, onDismiss }: { children: React.ReactNode; onDismiss: () => void }) => (
      <V>
        <P onPress={onDismiss}>
          <T>backdrop</T>
        </P>
        {children}
      </V>
    ),
  };
});
jest.mock('@/i18n', () => ({ useT: () => (k: string) => k.replace('decide.v3.ui.record.', '') }));
jest.mock('@/shell/a11yFocus', () => ({ focusAccessibility: jest.fn() }));
jest.mock('@/theme/layout', () => ({ ...jest.requireActual('@/theme/layout'), useScreenInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@/ui/haptics', () => ({ hapticSuccess: jest.fn() }));
jest.mock('@/state/undoToast', () => ({ showToast: (...a: unknown[]) => mockToast(...a) }));
jest.mock('@/data/mutations/undo', () => ({ useUndo: () => ({ undo: mockUndo }) }));
jest.mock('@/features/decide/notifications/waitReminder', () => ({ cancelCheckReminders: () => Promise.resolve() }));
jest.mock('@/features/decide/ui/textFit', () => ({ useShouldStack: () => false }));
jest.mock('@/features/record/useRecordContext', () => ({
  useRecordContext: () => ({ homeCurrency: 'USD', timeZone: 'UTC', today: '2026-10-30' }),
}));
jest.mock('../useCheckWritesSettled', () => ({ useCheckWritesSettled: () => true }));
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

function actions(): RecordMutations {
  return {
    canRecordBought: jest.fn(() => true),
    recordBought: jest.fn(() => ({ stepId: 'b1' })),
    planIt: jest.fn(() => Promise.resolve({ reminder: 'set' as const, stepId: 'p1' as string | null })),
    notBuying: jest.fn(() => 'n1' as string | null),
  };
}

async function open(variant: 'bought' | 'plan' | 'pass') {
  const onClose = jest.fn();
  await render(
    <ThemeProvider>
      <RecordMutationsContext.Provider value={actions()}>
        <View>
          <RecordSheet variant={variant} visible onClose={onClose} row={row} evaluation={evaluation} />
        </View>
      </RecordMutationsContext.Provider>
    </ThemeProvider>
  );
  return onClose;
}

const TARGET = { entity: 'decide_checks', id: 'c1' };

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => undefined);
});

describe('RecordSheet Undo toast on close (05.3-101)', () => {
  it('bought: Back to Decide leaves one Undo toast for the write', async () => {
    const onClose = await open('bought');
    await fireEvent.press(screen.getByText('confirm'));
    expect(mockToast).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByText('backToDecide'));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(mockToast).toHaveBeenCalledTimes(1);
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({
        stepId: 'b1',
        text: { key: 'undo.label.decisionWritten', params: { name: 'Sofa' } },
        target: TARGET,
      })
    );
  });

  it('plan: a backdrop close leaves a planSaved toast', async () => {
    const onClose = await open('plan');
    await screen.findByText('undo');
    expect(mockToast).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByText('backdrop'));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(mockToast).toHaveBeenCalledTimes(1);
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ stepId: 'p1', text: { key: 'undo.label.planSaved', params: { name: 'Sofa' } }, target: TARGET })
    );
  });

  it('pass: a backdrop close leaves a notBuyingSaved toast', async () => {
    await open('pass');
    await screen.findByText('undo');
    await fireEvent.press(screen.getByText('backdrop'));
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ stepId: 'n1', text: { key: 'undo.label.notBuyingSaved', params: { name: 'Sofa' } }, target: TARGET })
    );
  });

  it("the sheet's own Undo passes the check row and shows no toast", async () => {
    const onClose = await open('bought');
    await fireEvent.press(screen.getByText('confirm'));
    await fireEvent.press(screen.getByText('undo'));
    expect(mockUndo).toHaveBeenCalledTimes(1);
    expect(mockUndo).toHaveBeenCalledWith(expect.objectContaining({ stepId: 'b1', expect: { entityId: 'c1' } }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(mockToast).not.toHaveBeenCalled();
  });

  it('closing at step A before any write shows no toast', async () => {
    const onClose = await open('bought');
    await fireEvent.press(screen.getByText('notYet'));
    await fireEvent.press(screen.getByText('backdrop'));
    expect(onClose).toHaveBeenCalled();
    expect(mockToast).not.toHaveBeenCalled();
  });
});
