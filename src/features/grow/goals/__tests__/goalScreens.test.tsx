// 06-22 (G02, G02a, D-08): the goal detail screen and its money moves. The 06-12 hooks, the reads and the shell are stubbed so the
// tests read what the screens decide: the plan figures, the withdrawal confirm, the one success haptic, the Remove question.
import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import type { SavingsGoalRow } from '@/db/savingsGoals';
import { minorUnits } from '@/engine/money';
import { wrap } from '@/features/decide/check/steps/__tests__/helpers/stepProps';
import { goal as goalFixture } from '@/features/decide/past/__tests__/helpers/pastFixtures';
import type { GoalsRead } from '../useGoalsRead';
import { GoalDetailScreen } from '../GoalDetailScreen';

jest.setTimeout(30000);

const mockMove = jest.fn();
const mockEdit = jest.fn(() => 's-edit');
const mockRemove = jest.fn(() => 's-remove');
const mockConfirm = jest.fn(() => 's-confirm');
const mockSave = jest.fn(() => ({ id: 'g1', stepId: 's-save' }));
const mockToast = jest.fn();
const mockHapticSuccess = jest.fn();
const mockHapticLight = jest.fn();
const mockBack = jest.fn();
const mockSetNet = jest.fn((..._a: unknown[]) => 's-net' as string | null);

jest.mock('expo-router', () => ({ router: { back: () => mockBack(), push: jest.fn() } }));
jest.mock('@/shell/navigation/pushOnce', () => ({ pushOnce: jest.fn() }));
jest.mock('@/shell/screen/DetailScreen', () => {
  const R = require('react');
  const { View, Text: RNText } = require('react-native');
  return {
    DetailScreen: (p: { title: string; right?: React.ReactNode; children?: React.ReactNode }) =>
      R.createElement(View, null, R.createElement(RNText, null, p.title), p.right, p.children),
  };
});
jest.mock('@/data/mutations/growGoals', () => ({
  useMoveGoalMoney: () => ({ move: (...a: unknown[]) => mockMove(...a) }),
  useEditGoal: () => ({ edit: (...a: unknown[]) => (mockEdit as (...x: unknown[]) => unknown)(...a), remove: (...a: unknown[]) => (mockRemove as (...x: unknown[]) => unknown)(...a) }),
  useConfirmGoalContribution: () => ({ confirm: (...a: unknown[]) => (mockConfirm as (...x: unknown[]) => unknown)(...a) }),
  useSaveGoalPlan: () => ({ save: (...a: unknown[]) => (mockSave as (...x: unknown[]) => unknown)(...a) }),
  useSetSafetyNet: () => ({ set: (...a: unknown[]) => mockSetNet(...a) }),
}));
let mockRows: SavingsGoalRow[] = [];
let mockLines: unknown[] = [];
jest.mock('@/data/queries/growGoals', () => ({
  useSavingsGoalRows: () => ({ data: mockRows, isError: false, refetch: jest.fn() }),
  useGoalLines: () => ({ data: mockLines }),
}));
jest.mock('@/data/queries/recurringSeries', () => ({ useRecurringSeries: () => ({ data: mockSeries }) }));
let mockSeries: unknown[] = [];
jest.mock('@/data/queries/accounts', () => ({
  useAccounts: () => ({
    data: [
      { id: 'a-sav', name: 'Savings account', currency: 'USD', archived_at: null },
      { id: 'a-chk', name: 'Everyday checking', currency: 'USD', archived_at: null },
    ],
  }),
}));
jest.mock('@/data/queries/categories', () => ({ useCategoryLookup: () => ({ transferCategoryId: 'cat-transfer' }) }));
jest.mock('@/data/queries/decide', () => ({ useDecideSettings: () => ({ data: { saving_floor: 15000 } }) }));
jest.mock('@/features/record/useRecordContext', () => ({
  useRecordContext: () => ({ homeCurrency: 'USD', today: mockToday, userId: 'u1', householdId: 'h1', ready: true, timeZone: 'UTC' }),
}));
let mockToday = '2026-10-20';
jest.mock('@/features/decide/past/usePastDecisions', () => ({
  usePastContext: () => ({
    userId: 'u1',
    householdId: 'h1',
    today: mockToday,
    ctx: { home: 'USD', rates: [], customs: [], today: mockToday, timeZone: 'UTC' },
    whole: (m: number) => `$${Math.round(m / 100)}`,
    wholeIn: () => (m: number) => `$${Math.round(m / 100)}`,
    formatDate: (d: string) => `on ${d}`,
  }),
}));
let mockRead: GoalsRead;
jest.mock('@/features/grow/goals/useGoalsRead', () => ({
  useGoalsRead: () => mockRead,
  toHomeOf: () => (a: number) => a,
}));
jest.mock('../useGoalToast', () => ({ useGoalToast: () => (...a: unknown[]) => mockToast(...a) }));
jest.mock('@/ui/haptics', () => ({
  hapticSelection: jest.fn(),
  hapticLight: () => mockHapticLight(),
  hapticWarning: jest.fn(),
  hapticSuccess: () => mockHapticSuccess(),
  hapticMedium: jest.fn(),
}));

function lisbon(over: Partial<SavingsGoalRow> = {}): SavingsGoalRow {
  return goalFixture('', {
    id: 'g1',
    name: 'Trip to Lisbon',
    kind: 'pot',
    target: 180_000,
    monthly_amount: 5_000,
    ready_by: null,
    opening_saved: 49_000,
    account_id: 'a-sav',
    locked: false,
    is_safety_net: false,
    bucket: null,
    check_id: null,
    ...over,
  });
}

function readWith(saved: number, over: Partial<{ locked: boolean }> = {}): GoalsRead {
  return {
    status: 'ready',
    userId: 'u1',
    householdId: 'h1',
    today: mockToday,
    refetch: jest.fn(),
    model: {
      safetyNet: null,
      goals: [
        {
          id: 'g1', name: 'Trip to Lisbon', kind: 'pot', target: minorUnits(180_000), saved: minorUnits(saved), monthlyAmount: minorUnits(5_000),
          readyBy: null, locked: over.locked ?? false, upFrontOnly: false, linkedCheckId: null, accountId: 'a-sav', bucket: false, done: false,
        },
      ],
      totalSaved: saved,
      monthlyIntoGoals: 5_000,
      needsNetConfirm: false,
    },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockToday = '2026-10-20';
  mockRows = [lisbon()];
  mockLines = [];
  mockSeries = [];
  mockRead = readWith(64_000);
  mockMove.mockReturnValue({ stepId: 's-move', transferId: 't1', reachedTarget: false });
});

async function typeMoney(label: string, text: string) {
  // a sheet's own label can repeat the field's label; the field is the one that takes text
  const field = screen.getAllByLabelText(label).find((n) => typeof n.props.onChangeText === 'function')!;
  await fireEvent.changeText(field, text);
  await fireEvent(field, 'blur');
}

describe('goal detail', () => {
  it('06-19: "Try other amounts or dates" opens the goal calculator, and only a goal with a target has it', async () => {
    const { pushOnce } = require('@/shell/navigation/pushOnce') as { pushOnce: jest.Mock };
    await wrap(<GoalDetailScreen id="g1" />);
    await fireEvent.press(screen.getByTestId('goal-try-other'));
    expect(pushOnce).toHaveBeenCalledWith('/grow/calculators/goal/g1');
  });

  it('06-19: a goal with no target has no calculator link', async () => {
    mockRows = [lisbon({ target: null })];
    await wrap(<GoalDetailScreen id="g1" />);
    expect(screen.queryByTestId('goal-try-other')).toBeNull();
  });

  it('shows saved of target, the Plan rows and the two buttons', async () => {
    await wrap(<GoalDetailScreen id="g1" />);
    expect(screen.getByTestId('goal-saved').props.children).toBe('$640');
    expect(screen.getByText('of $1,800')).toBeTruthy();
    expect(screen.getByText('Plan')).toBeTruthy();
    expect(screen.getByText('Each month')).toBeTruthy();
    expect(screen.getByText('$50.00')).toBeTruthy();
    expect(screen.getByText('Reaches $1,800')).toBeTruthy();
    expect(screen.getByText('Add money')).toBeTruthy();
    expect(screen.getByText('Take some out')).toBeTruthy();
    expect(screen.getByText('Kept in')).toBeTruthy();
    expect(screen.getByText('Savings account')).toBeTruthy();
  });

  it('editing Each month to $75 previews the new reach date', async () => {
    await wrap(<GoalDetailScreen id="g1" />);
    await fireEvent.press(screen.getByText('Each month'));
    await typeMoney('Each month', '75');
    // 1,160 left at 75 a month is 16 deposits, the first on 1 Nov 2026: the 16th falls in Feb 2028.
    expect(screen.getByText('Reaches $1,800 by Feb 2028')).toBeTruthy();
  });

  it('editing the date to Dec 2027 previews $82.86, rounded up', async () => {
    await wrap(<GoalDetailScreen id="g1" />);
    await fireEvent.press(screen.getByText('Reaches $1,800'));
    await fireEvent.press(screen.getByText('Pick a date'));
    await fireEvent.press(screen.getAllByText('Dec 2027').at(-1)!);
    expect(screen.getByText('$82.86 a month')).toBeTruthy();
  });

  it('a locked goal says Decide keeps the money out of every answer; an unlocked one shows no Locked badge', async () => {
    await wrap(<GoalDetailScreen id="g1" />);
    expect(screen.queryByText('Locked')).toBeNull();
    expect(screen.queryByText('Decide keeps $640 out of every answer.')).toBeNull();
  });

  it('an unlocked goal says its saved money counts as spare money in Decide; a locked one keeps the lock line', async () => {
    await wrap(<GoalDetailScreen id="g1" />);
    expect(screen.getByText('Unlocked: this goal’s $640 counts as spare money in Decide.')).toBeTruthy();
    expect(screen.queryByText('Locked: Decide never spends the money saved here.')).toBeNull();
  });

  it('a locked goal keeps the lock helper and shows no unlocked note', async () => {
    mockRows = [lisbon({ locked: true })];
    mockRead = readWith(64_000, { locked: true });
    await wrap(<GoalDetailScreen id="g1" />);
    expect(screen.getByText('Locked: Decide never spends the money saved here.')).toBeTruthy();
    expect(screen.queryByText(/counts as spare money/)).toBeNull();
  });

  it('a locked goal shows the Locked badge and the Decide line', async () => {
    mockRows = [lisbon({ locked: true })];
    mockRead = readWith(64_000, { locked: true });
    await wrap(<GoalDetailScreen id="g1" />);
    expect(screen.getByText('Locked')).toBeTruthy();
    expect(screen.getByText('Decide keeps $640 out of every answer.')).toBeTruthy();
  });

  it('history shows an Expected line with a clock badge and the monthly record line', async () => {
    mockSeries = [{ id: 's1', goal_id: 'g1', deleted_at: null, end_date: null, amount: -5000, anchor_date: '2026-09-16', account_id: 'a-chk', time_zone: 'UTC', name: 'Trip to Lisbon', category_id: null }];
    mockLines = [
      { id: 'l1', goal_id: 'g1', status: 'pending', deleted_at: null, transfer_id: null, original_amount: -5000, original_currency: 'USD', local_date: '2026-11-16', account_id: 'a-chk', household_id: 'h1', version: 1 },
      { id: 'l2', goal_id: 'g1', status: 'paid', deleted_at: null, transfer_id: null, original_amount: -5000, original_currency: 'USD', local_date: '2026-10-16', account_id: 'a-chk', household_id: 'h1', version: 1 },
    ];
    await wrap(<GoalDetailScreen id="g1" />);
    expect(screen.getByText('Automatic · $50 on the 16th, recorded for you to confirm')).toBeTruthy();
    expect(screen.getByText('on 2026-11-16 · $50 · Expected')).toBeTruthy();
    expect(screen.getByText('on 2026-10-16 · $50')).toBeTruthy();
    expect(screen.getByText('Expected')).toBeTruthy();
    // tapping the Expected row offers the confirm, which calls the hook once
    await fireEvent.press(screen.getByLabelText('on 2026-11-16 · $50 · Expected'));
    expect(screen.queryByText('Done')).toBeNull();
    await fireEvent.press(screen.getByText('Confirm'));
    expect(mockConfirm).toHaveBeenCalledTimes(1);
  });

  it('a goal made from a Decide check shows the From a Decide check card', async () => {
    mockRows = [lisbon({ check_id: 'c1' })];
    await wrap(<GoalDetailScreen id="g1" />);
    expect(screen.getByText('From a Decide check')).toBeTruthy();
  });

  it('Remove asks first, then removes with an Undo toast; a safety net has no Remove', async () => {
    await wrap(<GoalDetailScreen id="g1" />);
    await fireEvent.press(screen.getByTestId('goal-remove'));
    expect(screen.getByText('Remove Trip to Lisbon?')).toBeTruthy();
    expect(screen.getByText('The $640 stays in Savings account. Only the goal goes.')).toBeTruthy();
    expect(mockRemove).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByText('Remove'));
    expect(mockRemove).toHaveBeenCalledTimes(1);
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ key: 'grow.goals.removedToast', stepId: 's-remove', undoLabel: 'goalRemoved' }));
    expect(mockBack).toHaveBeenCalled();
  });

  it('the safety net has no Remove action and no Use as my safety net row', async () => {
    mockRows = [lisbon({ is_safety_net: true, locked: true })];
    mockRead = { ...readWith(64_000), model: { ...readWith(64_000).model, goals: [], safetyNet: { goalId: 'g1', size: minorUnits(180_000), saved: minorUnits(64_000), protect: true, locked: true, accountId: 'a-sav', confirmedAt: 'x' } } };
    await wrap(<GoalDetailScreen id="g1" />);
    expect(screen.queryByTestId('goal-remove')).toBeNull();
    expect(screen.queryByText('Use as my safety net')).toBeNull();
  });
});

describe('use as my safety net', () => {
  it('a normal goal offers the row; confirming saves once and raises a toast with Undo', async () => {
    await wrap(<GoalDetailScreen id="g1" />);
    await fireEvent.press(screen.getByLabelText('Use as my safety net'));
    expect(mockSetNet).not.toHaveBeenCalled();
    await fireEvent.press(screen.getAllByText('Use as my safety net').at(-1)!);
    expect(mockSetNet).toHaveBeenCalledTimes(1);
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'grow.goals.useAsSafetyNet.toast', stepId: 's-net', undoLabel: 'safetyNetChanged', name: 'Trip to Lisbon' })
    );
  });
});

describe('money moves', () => {
  it('Add money: the primary label follows the amount, a light haptic, no success haptic on a normal deposit', async () => {
    await wrap(<GoalDetailScreen id="g1" />);
    await fireEvent.press(screen.getByText('Add money'));
    expect(screen.getByText('Add to Trip to Lisbon')).toBeTruthy();
    expect(screen.getByText('This records a move between your own accounts. It is not spending.')).toBeTruthy();
    await typeMoney('Amount', '50');
    await fireEvent.press(screen.getByLabelText('Add $50'));
    expect(mockMove).toHaveBeenCalledTimes(1);
    expect(mockMove.mock.calls[0]![0]).toMatchObject({ kind: 'add', amount: 5000, goalAccount: { id: 'a-sav' }, account: { id: 'a-chk' } });
    expect(mockHapticLight).toHaveBeenCalledTimes(1);
    expect(mockHapticSuccess).toHaveBeenCalledTimes(0);
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ key: 'undo.label.goalMoneyMoved', stepId: 's-move' }));
  });

  it('a deposit that reaches the target plays the moment once: success haptic once, Reached badge, toast with Undo', async () => {
    mockMove.mockReturnValue({ stepId: 's-reach', transferId: 't1', reachedTarget: true });
    await wrap(<GoalDetailScreen id="g1" />);
    await fireEvent.press(screen.getByText('Add money'));
    await typeMoney('Amount', '1160');
    await fireEvent.press(screen.getByLabelText('Add $1,160'));
    expect(mockHapticSuccess).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('goal-reached')).toBeTruthy();
    expect(screen.getByText('Reached')).toBeTruthy();
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'grow.goals.reachedToast', params: { target: '$1,800' }, stepId: 's-reach', undoLabel: 'goalMoneyMoved' })
    );
  });

  it('Take some out of a locked goal states the Decide effect first and writes nothing until confirmed', async () => {
    mockRows = [lisbon({ locked: true })];
    mockRead = readWith(64_000, { locked: true });
    mockMove.mockReturnValue({ stepId: 's-take', transferId: 't1', reachedTarget: false });
    await wrap(<GoalDetailScreen id="g1" />);
    await fireEvent.press(screen.getByText('Take some out'));
    await typeMoney('Amount', '200');
    await fireEvent.press(screen.getByLabelText('Take $200 out'));
    expect(screen.getByText('Take $200 from Trip to Lisbon?')).toBeTruthy();
    expect(screen.getByText(/Decide will count \$200 less as kept safe/)).toBeTruthy();
    expect(mockMove).not.toHaveBeenCalled();
    // Keep it: nothing written
    await fireEvent.press(screen.getByText('Keep it'));
    expect(mockMove).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByLabelText('Take $200 out'));
    await fireEvent.press(screen.getAllByText('Take $200 out').at(-1)!);
    expect(mockMove).toHaveBeenCalledTimes(1);
    expect(mockMove.mock.calls[0]![0]).toMatchObject({ kind: 'take', amount: 20000 });
    expect(mockHapticLight).toHaveBeenCalledTimes(1);
  });

  it('Take some out of an unlocked goal does not ask', async () => {
    await wrap(<GoalDetailScreen id="g1" />);
    await fireEvent.press(screen.getByText('Take some out'));
    await typeMoney('Amount', '20');
    await fireEvent.press(screen.getByLabelText('Take $20 out'));
    expect(mockMove).toHaveBeenCalledTimes(1);
  });
});
