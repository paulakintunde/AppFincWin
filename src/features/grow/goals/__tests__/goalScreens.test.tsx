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
let mockSavingIds: string[] = [];
jest.mock('@/data/mutations/growGoals', () => ({
  useGoalSaving: (id: string) => mockSavingIds.includes(id),
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
let mockSavRate: string | null = null;
let mockSavArchived: string | null = null;
let mockOnlySav = false;
jest.mock('@/data/queries/accounts', () => ({
  useAccounts: () => ({
    data: [
      { id: 'a-sav', name: 'Savings account', currency: 'USD', archived_at: mockSavArchived, interest_rate: mockSavRate },
      ...(mockOnlySav ? [] : [{ id: 'a-chk', name: 'Everyday checking', currency: 'USD', archived_at: null }]),
    ],
  }),
}));
const mockShowToast = jest.fn();
jest.mock('@/state/undoToast', () => ({
  ...jest.requireActual('@/state/undoToast'),
  showToast: (...a: unknown[]) => mockShowToast(...a),
}));
// 06-32: the record detail is Activity's; stubbed so the test reads which line it opens.
let mockLegs: unknown[] = [];
jest.mock('@/data/queries/activity', () => ({ useTransferLegs: () => ({ legs: mockLegs }) }));
jest.mock('@/features/record/activity/useRowActions', () => ({ useRowActions: () => ({}) }));
jest.mock('@/features/record/activity/useActivityViewModel', () => {
  const R = require('react');
  return {
    useRowFlow: () => {
      const [row, setRow] = R.useState(null);
      return {
        openDetail: setRow,
        detail: { row, visible: row !== null, onDismiss: () => setRow(null), onStatus: jest.fn(), onEdit: jest.fn(), onClone: jest.fn(), onDelete: jest.fn() },
        pendingDelete: null,
        answerDelete: jest.fn(),
        entryMode: null,
        setEntryMode: jest.fn(),
      };
    },
  };
});
jest.mock('@/features/record/activity/TransactionDetailSheet', () => {
  const R = require('react');
  const { Text: RNText } = require('react-native');
  return {
    TransactionDetailSheet: (p: { visible: boolean; row: { id: string; counterpartAccountId: string | null } | null }) =>
      p.visible && p.row ? R.createElement(RNText, { testID: 'tx-detail' }, `${p.row.id}:${p.row.counterpartAccountId ?? '-'}`) : null,
  };
});
jest.mock('@/features/record/entry/TransactionSheet', () => ({ TransactionSheet: () => null }));
jest.mock('@/features/record/entry/EditScopePrompt', () => ({ EditScopePrompt: () => null }));
let mockTransferCat: string | null = 'cat-transfer';
jest.mock('@/data/queries/categories', () => ({ useCategoryLookup: () => ({ transferCategoryId: mockTransferCat }) }));
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
  mockSavingIds = [];
  mockToday = '2026-10-20';
  mockRows = [lisbon()];
  mockLines = [];
  mockLegs = [];
  mockSavRate = null;
  mockSeries = [];
  mockRead = readWith(64_000);
  mockSavArchived = null;
  mockOnlySav = false;
  mockTransferCat = 'cat-transfer';
  mockMove.mockReset();
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
    expect(screen.getByText('$50')).toBeTruthy(); // GD3: whole units
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

  const line = (over: Record<string, unknown>) => ({
    goal_id: 'g1', status: 'paid', deleted_at: null, transfer_id: null, original_amount: -5000, original_currency: 'USD',
    account_id: 'a-chk', household_id: 'h1', version: 1, home_amount: -5000, ...over,
  });

  it('GD1/GD2: rows read date / source / amount; one Expected badge; only waiting lines and the next one are listed', async () => {
    mockSeries = [{ id: 's1', goal_id: 'g1', deleted_at: null, end_date: null, amount: -5000, anchor_date: '2026-09-16', account_id: 'a-chk', time_zone: 'UTC', name: 'Trip to Lisbon', category_id: null }];
    mockLines = [
      line({ id: 'l0', status: 'pending', local_date: '2026-10-16' }),
      line({ id: 'l1', status: 'pending', local_date: '2026-11-16' }),
      line({ id: 'l3', status: 'pending', local_date: '2026-12-16' }),
      line({ id: 'l2', status: 'paid', local_date: '2026-09-16' }),
    ];
    await wrap(<GoalDetailScreen id="g1" />);
    expect(screen.getByText('Automatic · $50 on the 16th, recorded for you to confirm')).toBeTruthy();
    expect(screen.getByText('on 2026-10-16')).toBeTruthy();
    expect(screen.getByText('on 2026-11-16')).toBeTruthy();
    expect(screen.queryByText('on 2026-12-16')).toBeNull(); // only the next expected month after today
    expect(screen.getAllByText('From Everyday checking').length).toBeGreaterThan(0);
    expect(screen.queryByText(/· Expected/)).toBeNull();
    expect(screen.getAllByText('Expected')).toHaveLength(2);
    // the start row: date, "Starting amount", amount
    expect(screen.getByText('Starting amount')).toBeTruthy();
    expect(screen.getByText('$490')).toBeTruthy();
    // only the waiting line (on or before today) has the inline Confirm
    expect(screen.getAllByLabelText(/^Confirm \$50 on/)).toHaveLength(1);
  });

  it('CRUD #6: the inline Confirm writes at once through the confirm hook, once, with an Undo toast, and opens no sheet', async () => {
    mockLines = [line({ id: 'l0', status: 'pending', local_date: '2026-10-16' })];
    await wrap(<GoalDetailScreen id="g1" />);
    await fireEvent.press(screen.getByLabelText('Confirm $50 on on 2026-10-16'));
    expect(mockConfirm).toHaveBeenCalledTimes(1);
    expect((mockConfirm.mock.calls[0] as unknown[])[0]).toMatchObject({ ownerId: 'u1', line: { id: 'l0' }, goal: { id: 'g1' } });
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ key: 'undo.label.goalContributionConfirmed', stepId: 's-confirm', undoLabel: 'goalContributionConfirmed' }));
    expect(screen.queryByText('Cancel')).toBeNull();
  });

  it('tapping an Expected row text opens the confirm sheet; Confirm there calls the hook once', async () => {
    mockLines = [line({ id: 'l1', status: 'pending', local_date: '2026-11-16' })];
    await wrap(<GoalDetailScreen id="g1" />);
    await fireEvent.press(screen.getByLabelText('on 2026-11-16, $50, From Everyday checking, Expected'));
    expect(mockConfirm).not.toHaveBeenCalled();
    expect(screen.getByText('Confirm $50 on on 2026-11-16')).toBeTruthy();
    await fireEvent.press(screen.getAllByText('Confirm').at(-1)!);
    expect(mockConfirm).toHaveBeenCalledTimes(1);
  });

  it('CRUD #5: a paid transfer row opens the record with its counterpart; the start row is plain text', async () => {
    mockLines = [line({ id: 'in1', status: 'paid', local_date: '2026-10-02', transfer_id: 't1', account_id: 'a-sav', original_amount: 2000 })];
    mockLegs = [
      { id: 'in1', transfer_id: 't1', account_id: 'a-sav' },
      { id: 'out1', transfer_id: 't1', account_id: 'a-chk' },
    ];
    await wrap(<GoalDetailScreen id="g1" />);
    expect(screen.queryByTestId('tx-detail')).toBeNull();
    await fireEvent.press(screen.getByLabelText('on 2026-10-02, $20, From Everyday checking. Opens the record.'));
    expect(screen.getByTestId('tx-detail').props.children).toBe('in1:a-chk');
    // the start row cannot be opened
    expect(screen.queryByLabelText(/Starting amount\. Opens the record/)).toBeNull();
  });

  it('a take-out leg reads "Back to" the other account', async () => {
    mockLines = [line({ id: 'o1', status: 'paid', local_date: '2026-10-03', transfer_id: 't2', account_id: 'a-sav', original_amount: -3000 })];
    mockLegs = [{ id: 'i2', transfer_id: 't2', account_id: 'a-chk' }];
    await wrap(<GoalDetailScreen id="g1" />);
    expect(screen.getByText('Back to Everyday checking')).toBeTruthy();
  });

  it('empty history offers Add money, which opens the move sheet', async () => {
    mockRows = [lisbon({ opening_saved: 0 })];
    await wrap(<GoalDetailScreen id="g1" />);
    expect(screen.getByText('No money moved yet')).toBeTruthy();
    await fireEvent.press(screen.getAllByText('Add money').at(-1)!);
    expect(screen.getByText('Add to Trip to Lisbon')).toBeTruthy();
  });

  it('CRUD #8: with a rate on the kept-in account, "Interest a year" opens the account; with none there is no row', async () => {
    const { pushOnce } = require('@/shell/navigation/pushOnce') as { pushOnce: jest.Mock };
    await wrap(<GoalDetailScreen id="g1" />);
    expect(screen.queryByText('Interest a year')).toBeNull();
    mockSavRate = '4.1';
    await wrap(<GoalDetailScreen id="g1" />);
    expect(screen.getByText('4.1%')).toBeTruthy();
    await fireEvent.press(screen.getByText('Interest a year'));
    expect(pushOnce).toHaveBeenCalledWith('/accounts/a-sav');
  });

  it('device check: tapping Kept in opens Where is it kept?; picking another account saves only account_id', async () => {
    await wrap(<GoalDetailScreen id="g1" />);
    await fireEvent.press(screen.getByLabelText('Kept in Savings account. Change the account.'));
    expect(screen.getByText('Where is it kept?')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Everyday checking'));
    await fireEvent.press(screen.getByText('Save'));
    expect(mockEdit).toHaveBeenCalledWith(expect.objectContaining({ id: 'g1' }), { account_id: 'a-chk' }, expect.anything(), expect.anything());
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
    // the move lands: the read model now shows the target reached
    mockMove.mockImplementation(() => {
      mockRead = readWith(180_000);
      return { stepId: 's-reach', transferId: 't1', reachedTarget: true };
    });
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

  it('N3: the move sheet has two date chips, Today and Pick a date', async () => {
    await wrap(<GoalDetailScreen id="g1" />);
    await fireEvent.press(screen.getByText('Add money'));
    expect(screen.getByText('Today')).toBeTruthy();
    expect(screen.getByLabelText('Pick a date')).toBeTruthy();
  });

  it('N3: a net goal moves with the net titles', async () => {
    mockRows = [lisbon({ is_safety_net: true, locked: true })];
    mockRead = { ...readWith(64_000), model: { ...readWith(64_000).model, goals: [], safetyNet: { goalId: 'g1', size: minorUnits(180_000), saved: minorUnits(64_000), protect: true, locked: true, accountId: 'a-sav', confirmedAt: 'x' } } };
    await wrap(<GoalDetailScreen id="g1" />);
    await fireEvent.press(screen.getByText('Take some out'));
    expect(screen.getByText('Take from the safety net')).toBeTruthy();
  });

  it('Take some out of an unlocked goal does not ask', async () => {
    await wrap(<GoalDetailScreen id="g1" />);
    await fireEvent.press(screen.getByText('Take some out'));
    await typeMoney('Amount', '20');
    await fireEvent.press(screen.getByLabelText('Take $20 out'));
    expect(mockMove).toHaveBeenCalledTimes(1);
  });
});

describe('Phase 6 review, part 4', () => {
  const isDisabled = (label: string) => screen.getByLabelText(label).props.accessibilityState?.disabled === true;

  it('P4-CR-01: when the only account is the goal own, the move is blocked with a plain reason and never written', async () => {
    mockOnlySav = true;
    await wrap(<GoalDetailScreen id="g1" />);
    await fireEvent.press(screen.getByText('Add money'));
    await typeMoney('Amount', '50');
    expect(screen.getByText('There is no other USD account to move money with. Add one in Accounts first.')).toBeTruthy();
    expect(isDisabled('Add $50')).toBe(true);
    await fireEvent.press(screen.getByLabelText('Add $50'));
    expect(mockMove).not.toHaveBeenCalled();
  });

  it('P4-CR-02: with the Transfer category not loaded, Add is blocked with a reason', async () => {
    mockTransferCat = null;
    await wrap(<GoalDetailScreen id="g1" />);
    await fireEvent.press(screen.getByText('Add money'));
    await typeMoney('Amount', '50');
    expect(screen.getByText('Your categories have not loaded yet. Check your connection and try again.')).toBeTruthy();
    expect(isDisabled('Add $50')).toBe(true);
  });

  it('P4-CR-01/02: a write that throws shows a toast instead of crashing, and the sheet stays open', async () => {
    mockMove.mockImplementation(() => {
      throw new TypeError('move goal money: invalid transfer (same-account)');
    });
    await wrap(<GoalDetailScreen id="g1" />);
    await fireEvent.press(screen.getByText('Add money'));
    await typeMoney('Amount', '50');
    await fireEvent.press(screen.getByLabelText('Add $50'));
    expect(mockShowToast).toHaveBeenCalledWith({ kind: 'refusal', text: { key: 'grow.goals.move.failed' } });
    expect(mockToast).not.toHaveBeenCalled();
    expect(mockHapticLight).not.toHaveBeenCalled();
    expect(screen.getByText('Add to Trip to Lisbon')).toBeTruthy();
  });

  it('P4-WR-08: an archived goal account says why and offers Where is it kept?', async () => {
    mockSavArchived = '2026-10-01T00:00:00Z';
    await wrap(<GoalDetailScreen id="g1" />);
    await fireEvent.press(screen.getByText('Take some out'));
    expect(screen.getByText('This goal’s account is archived or in another currency. Choose where it is kept.')).toBeTruthy();
    await fireEvent.press(screen.getByText('Choose where it is kept'));
    expect(screen.queryByText('Take from Trip to Lisbon')).toBeNull();
    expect(screen.getByText('Where is it kept?')).toBeTruthy();
  });

  it('P4-WR-08: Take from a goal with no account says to choose one first', async () => {
    mockRows = [lisbon({ account_id: null })];
    await wrap(<GoalDetailScreen id="g1" />);
    await fireEvent.press(screen.getByText('Take some out'));
    expect(screen.getByText('Choose where this goal is kept before taking money out.')).toBeTruthy();
  });

  it('P4-CR-03: saving a new Each month also stores the ready_by it reaches, so Decide sets aside for the same plan', async () => {
    await wrap(<GoalDetailScreen id="g1" />);
    await fireEvent.press(screen.getByText('Each month'));
    await typeMoney('Each month', '75');
    await fireEvent.press(screen.getAllByText('Save').at(-1)!);
    expect(mockSave).toHaveBeenCalledTimes(1);
    // 1,160 left at 75 a month reaches in Feb 2028 (the preview test above): the last day of that month.
    expect((mockSave.mock.calls[0] as unknown[])[0]).toMatchObject({ fields: { monthly_amount: 7500, ready_by: '2028-02-29' } });
  });

  it('P4-WR-01: a goal in another currency shows its saved, target and plan in that currency', async () => {
    mockRows = [lisbon({ currency: 'EUR' })];
    mockRead = readWith(70_000); // the home-currency (USD) figure Decide reads
    await wrap(<GoalDetailScreen id="g1" />);
    // saved in EUR is the opening 490 (no lines), not the USD figure
    expect(screen.getByTestId('goal-saved').props.children).toBe('€490');
    expect(screen.getByText('of €1,800')).toBeTruthy();
    expect(screen.getByText('€50')).toBeTruthy();
  });

  it('P4-WR-02: a Wait goal offers no Edit and no plan edits, and says the plan is its check', async () => {
    mockRows = [lisbon({ kind: 'wait', check_id: 'c1' })];
    await wrap(<GoalDetailScreen id="g1" />);
    expect(screen.queryByTestId('goal-edit')).toBeNull();
    expect(screen.getByTestId('goal-wait-note')).toBeTruthy();
    expect(screen.queryByTestId('goal-try-other')).toBeNull();
    await fireEvent.press(screen.getByText('Each month'));
    expect(screen.queryAllByText('Save')).toHaveLength(0);
  });

  it('device check 2026-11-11: a new goal still saving shows the loading state, not "removed"', async () => {
    mockRows = [];
    mockSavingIds = ['g1'];
    mockRead = { ...readWith(0), model: { ...readWith(0).model, goals: [] } };
    await wrap(<GoalDetailScreen id="g1" />);
    expect(screen.getByTestId('goal-loading')).toBeTruthy();
    expect(screen.queryByText('This goal was removed.')).toBeNull();
  });

  it('P4-WR-03: a removed goal says so instead of loading forever', async () => {
    mockRows = [];
    mockRead = { ...readWith(0), model: { ...readWith(0).model, goals: [] } };
    await wrap(<GoalDetailScreen id="g1" />);
    expect(screen.queryByTestId('goal-loading')).toBeNull();
    expect(screen.getByText('This goal was removed.')).toBeTruthy();
    await fireEvent.press(screen.getByText('Back'));
    expect(mockBack).toHaveBeenCalled();
  });

  it('P4-WR-03: a finished goal says it is done', async () => {
    mockRows = [lisbon({ done_at: '2026-10-01T00:00:00Z' })];
    mockRead = { ...readWith(0), model: { ...readWith(0).model, goals: [] } };
    await wrap(<GoalDetailScreen id="g1" />);
    expect(screen.getByTestId('goal-done')).toBeTruthy();
  });

  it('P4-WR-04: the Reached moment goes when the deposit is undone', async () => {
    mockMove.mockImplementation(() => {
      mockRead = readWith(180_000);
      return { stepId: 's-reach', transferId: 't1', reachedTarget: true };
    });
    await wrap(<GoalDetailScreen id="g1" />);
    await fireEvent.press(screen.getByText('Add money'));
    await typeMoney('Amount', '1160');
    await fireEvent.press(screen.getByLabelText('Add $1,160'));
    expect(screen.getByTestId('goal-reached')).toBeTruthy();
    // Undo: the read model is back below the target; any re-render drops the moment and the badge
    mockRead = readWith(64_000);
    await fireEvent.press(screen.getByText('Take some out'));
    expect(screen.queryByTestId('goal-reached')).toBeNull();
    expect(screen.queryByText('Reached')).toBeNull();
  });

  it('P4-WR-05: a sent Confirm is not offered again while the line still reads Expected', async () => {
    mockLines = [line2({ id: 'l0', status: 'pending', local_date: '2026-10-16' })];
    await wrap(<GoalDetailScreen id="g1" />);
    await fireEvent.press(screen.getByLabelText('Confirm $50 on on 2026-10-16'));
    expect(mockConfirm).toHaveBeenCalledTimes(1);
    expect(screen.queryByLabelText('Confirm $50 on on 2026-10-16')).toBeNull();
    // the confirm sheet path is guarded too
    await fireEvent.press(screen.getByLabelText('on 2026-10-16, $50, From Everyday checking, Expected'));
    await fireEvent.press(screen.getAllByText('Confirm').at(-1)!);
    expect(mockConfirm).toHaveBeenCalledTimes(1);
  });
});

function line2(over: Record<string, unknown>) {
  return {
    goal_id: 'g1', status: 'paid', deleted_at: null, transfer_id: null, original_amount: -5000, original_currency: 'USD',
    account_id: 'a-chk', household_id: 'h1', version: 1, home_amount: -5000, ...over,
  };
}
