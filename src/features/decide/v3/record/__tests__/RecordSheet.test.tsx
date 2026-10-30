/** 05.3-27: the record sheets write through useRecordMutations, show no toast, and Undo reverses the bought write. */
import React from 'react';
import { AccessibilityInfo, View } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { RecordSheet } from '../RecordSheet';
import { RecordMutationsContext, type RecordMutations } from '../recordMutations';

jest.setTimeout(60000);

const mockUndo = jest.fn();
const mockHaptic = jest.fn();
const mockToast = jest.fn();
let mockStack = false;
let mockCtx: unknown = { cashAccountId: 'a1', today: '2026-10-30' };

jest.mock('@/ui/Sheet', () => {
  const { View: V } = require('react-native');
  return { Sheet: ({ children }: { children: React.ReactNode }) => <V>{children}</V> };
});
jest.mock('@/i18n', () => ({ useT: () => (k: string) => k.replace('decide.v3.ui.record.', '') }));
jest.mock('@/shell/a11yFocus', () => ({ focusAccessibility: jest.fn() }));
jest.mock('@/theme/layout', () => ({ ...jest.requireActual('@/theme/layout'), useScreenInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@/ui/haptics', () => ({ hapticSuccess: () => mockHaptic() }));
jest.mock('@/state/undoToast', () => ({ showToast: (...a: unknown[]) => mockToast(...a) }));
jest.mock('@/data/mutations/undo', () => ({ useUndo: () => ({ undo: mockUndo }) }));
jest.mock('@/features/decide/ui/textFit', () => ({ useShouldStack: () => mockStack }));
jest.mock('@/features/record/useRecordContext', () => ({
  useRecordContext: () => ({ homeCurrency: 'USD', timeZone: 'UTC', today: '2026-10-30' }),
}));
jest.mock('../useBoughtContext', () => ({ useBoughtContext: () => mockCtx }));
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

function actions(over: Partial<RecordMutations> = {}): RecordMutations {
  return {
    canRecordBought: jest.fn(() => true),
    recordBought: jest.fn(() => ({ stepId: 'step-1' })),
    planIt: jest.fn(() => Promise.resolve({ reminder: 'set' as const })),
    notBuying: jest.fn(),
    ...over,
  };
}

async function open(variant: 'bought' | 'plan' | 'pass', a: RecordMutations, onClose = jest.fn(), ev: unknown = evaluation) {
  await render(
    <ThemeProvider>
      <RecordMutationsContext.Provider value={a}>
        <View>
          <RecordSheet variant={variant} visible onClose={onClose} row={row} evaluation={ev as never} />
        </View>
      </RecordMutationsContext.Provider>
    </ThemeProvider>
  );
  return onClose;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockStack = false;
  mockCtx = { cashAccountId: 'a1', today: '2026-10-30' };
  jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => undefined);
});

describe('RecordSheet bought', () => {
  it('step A shows the lines and Not yet closes without writing', async () => {
    const a = actions();
    const onClose = await open('bought', a);
    expect(screen.getByText('boughtTitle')).toBeTruthy();
    expect(screen.getByText('lineItem')).toBeTruthy();
    expect(screen.getByText('lineUnspent')).toBeTruthy();
    await fireEvent.press(screen.getByText('notYet'));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(a.recordBought).not.toHaveBeenCalled();
  });

  it('confirm writes once, moves to step B, fires Success once and announces', async () => {
    const a = actions();
    await open('bought', a);
    await fireEvent.press(screen.getByText('confirm'));
    expect(a.recordBought).toHaveBeenCalledTimes(1);
    expect(screen.getByText('doneTitle')).toBeTruthy();
    expect(screen.getByText('lineUnspentDone')).toBeTruthy();
    expect(mockHaptic).toHaveBeenCalledTimes(1);
    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith('announced');
    expect(mockToast).not.toHaveBeenCalled();
  });

  it('a second press does nothing when the write returned nothing is retried, but not while one is sent', async () => {
    const a = actions({ recordBought: jest.fn(() => null) });
    await open('bought', a);
    await fireEvent.press(screen.getByText('confirm'));
    expect(screen.getByText('boughtTitle')).toBeTruthy();
    await fireEvent.press(screen.getByText('confirm'));
    expect(a.recordBought).toHaveBeenCalledTimes(2);
  });

  it('Undo reverses with the returned step id and closes; no toast', async () => {
    const a = actions();
    const onClose = await open('bought', a);
    await fireEvent.press(screen.getByText('confirm'));
    await fireEvent.press(screen.getByText('undo'));
    expect(mockUndo).toHaveBeenCalledWith({
      stepId: 'step-1',
      ownerId: 'u1',
      householdId: 'h1',
      labelKey: 'decisionWritten',
      labelParams: { name: 'Sofa' },
    });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(mockToast).not.toHaveBeenCalled();
  });

  it('Back to Decide closes without undoing', async () => {
    const a = actions();
    const onClose = await open('bought', a);
    await fireEvent.press(screen.getByText('confirm'));
    await fireEvent.press(screen.getByText('backToDecide'));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(mockUndo).not.toHaveBeenCalled();
  });

  it('with no everyday account the confirm is disabled and says why', async () => {
    mockCtx = null;
    const a = actions({ canRecordBought: jest.fn(() => false) });
    await open('bought', a);
    expect(screen.getByText('noAccount')).toBeTruthy();
    await fireEvent.press(screen.getByText('confirm'));
    expect(a.recordBought).not.toHaveBeenCalled();
  });

  it('a payment plan lists the plan and the deposit', async () => {
    const plan = {
      ...(evaluation as object),
      purchase: {
        whole: 3_500_000,
        dayOne: 500_000,
        financed: true,
        categoryId: null,
        schedule: { cadence: { unit: 'month', every: 1 }, count: 60, payment: 53_336, financed: 3_000_000 },
      },
    };
    await open('bought', actions(), jest.fn(), plan);
    expect(screen.getByText('linePlan')).toBeTruthy();
    expect(screen.getByText('lineDeposit')).toBeTruthy();
  });

  it('stacks its buttons under rule S', async () => {
    mockStack = true;
    await open('bought', actions());
    expect(screen.getByText('notYet')).toBeTruthy();
    expect(screen.getByText('confirm')).toBeTruthy();
  });
});

describe('RecordSheet plan and pass', () => {
  it('Plan it writes at mount and shows the reminder line', async () => {
    const a = actions();
    await open('plan', a);
    expect(a.planIt).toHaveBeenCalledTimes(1);
    expect(screen.getByText('planTitle')).toBeTruthy();
    expect(await screen.findByText('reminderOn')).toBeTruthy();
    expect(screen.queryByText('undo')).toBeNull();
    expect(mockToast).not.toHaveBeenCalled();
  });

  it('reminder off shows the off line', async () => {
    await open('plan', actions({ planIt: jest.fn(() => Promise.resolve({ reminder: 'off' as const })) }));
    expect(await screen.findByText('reminderOff')).toBeTruthy();
  });

  it('the payday variant names the date', async () => {
    const payday = {
      ...(evaluation as object),
      result: { ...(evaluation as { result: object }).result, variant: 'payday', readyBy: { kind: 'date', date: '2026-11-05' } },
    };
    await open('plan', actions(), jest.fn(), payday);
    expect(await screen.findByText('reminderOnDate')).toBeTruthy();
  });

  it('a month-only ready-by reads as the first of that month', async () => {
    const payday = {
      ...(evaluation as object),
      result: { ...(evaluation as { result: object }).result, variant: 'payday', readyBy: { kind: 'month', month: '2026-12' } },
    };
    await open('plan', actions(), jest.fn(), payday);
    expect(await screen.findByText('reminderOnDate')).toBeTruthy();
  });

  it('Not buying writes at mount and shows its note', async () => {
    const a = actions();
    const onClose = await open('pass', a);
    expect(a.notBuying).toHaveBeenCalledTimes(1);
    expect(screen.getByText('notTitle')).toBeTruthy();
    expect(screen.getByText('notBody')).toBeTruthy();
    expect(screen.getByText('notLine')).toBeTruthy();
    await fireEvent.press(screen.getByText('backToDecide'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('writes with the household context when no cash account is known', async () => {
    mockCtx = null;
    const a = actions();
    await open('pass', a);
    expect(a.notBuying).toHaveBeenCalledWith(expect.objectContaining({ ctx: expect.objectContaining({ householdId: 'h1', cashAccountId: null }) }));
  });
});
