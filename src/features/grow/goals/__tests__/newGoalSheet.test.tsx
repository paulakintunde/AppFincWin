// 06-22 (G03, D-23, D-25): the new goal sheet. The lock question has no preselected answer and "Make goal" waits for it; the
// save carries exactly the user's answer, never the safety-net flag; a monthly record is only requested when the switch is on.
import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import type { SavingsGoalRow } from '@/db/savingsGoals';
import { minorUnits } from '@/engine/money';
import { wrap } from '@/features/decide/check/steps/__tests__/helpers/stepProps';
import { goal as goalFixture } from '@/features/decide/past/__tests__/helpers/pastFixtures';
import type { GoalsRead } from '../useGoalsRead';
import { NewGoalSheet } from '../NewGoalSheet';

jest.setTimeout(30000);

const mockSave = jest.fn((..._a: unknown[]) => ({ id: 'new-goal', stepId: 's-make' }));
const mockToast = jest.fn();
const mockPush = jest.fn();
const mockLight = jest.fn();

jest.mock('expo-crypto', () => ({ randomUUID: () => 'series-uuid' }));
jest.mock('@/shell/navigation/pushOnce', () => ({ pushOnce: (h: unknown) => mockPush(h) }));
jest.mock('@/data/mutations/growGoals', () => ({
  useSaveGoalPlan: () => ({ save: (...a: unknown[]) => mockSave(...a) }),
}));
jest.mock('@/data/queries/accounts', () => ({
  useAccounts: () => ({
    data: [
      { id: 'a-sav', name: 'Savings account', currency: 'USD', archived_at: null },
      { id: 'a-chk', name: 'Everyday checking', currency: 'USD', archived_at: null },
    ],
  }),
}));
jest.mock('@/data/queries/recurringSeries', () => ({ useRecurringSeries: () => ({ data: [] }) }));
jest.mock('@/data/queries/categories', () => ({ useCategoryLookup: () => ({ transferCategoryId: 'cat-transfer' }) }));
jest.mock('@/data/queries/decide', () => ({ useDecideSettings: () => ({ data: { saving_floor: 15000 } }) }));
jest.mock('@/features/record/useRecordContext', () => ({
  useRecordContext: () => ({ homeCurrency: 'USD', today: '2026-10-20', userId: 'u1', householdId: 'h1', ready: true, timeZone: 'UTC' }),
}));
jest.mock('@/features/decide/past/usePastDecisions', () => ({
  usePastContext: () => ({
    userId: 'u1',
    householdId: 'h1',
    today: '2026-10-20',
    ctx: { home: 'USD', rates: [], customs: [], today: '2026-10-20', timeZone: 'UTC' },
    whole: (m: number) => `$${Math.round(m / 100)}`,
    wholeIn: () => (m: number) => `$${Math.round(m / 100)}`,
    formatDate: (d: string) => d,
  }),
}));
jest.mock('@/features/grow/goals/useGoalsRead', () => ({
  useGoalsRead: () => mockRead,
  toHomeOf: () => (a: number) => a,
}));
jest.mock('../useGoalToast', () => ({ useGoalToast: () => (...a: unknown[]) => mockToast(...a) }));
jest.mock('@/ui/haptics', () => ({
  hapticSelection: jest.fn(),
  hapticLight: () => mockLight(),
  hapticWarning: jest.fn(),
  hapticSuccess: jest.fn(),
  hapticMedium: jest.fn(),
}));

const mockRead: GoalsRead = {
  status: 'ready',
  userId: 'u1',
  householdId: 'h1',
  today: '2026-10-20',
  refetch: jest.fn(),
  model: {
    safetyNet: null,
    goals: [
      {
        id: 'g0', name: 'Laptop', kind: 'pot', target: minorUnits(350000), saved: minorUnits(0), monthlyAmount: minorUnits(15000),
        readyBy: null, locked: true, upFrontOnly: false, linkedCheckId: null, accountId: null, bucket: false, done: false,
      },
    ],
    totalSaved: 0,
    monthlyIntoGoals: 15000,
    needsNetConfirm: false,
  },
};

beforeEach(() => {
  jest.clearAllMocks();
});

async function typeMoney(label: string, text: string) {
  const field = screen.getByLabelText(label);
  await fireEvent.changeText(field, text);
  await fireEvent(field, 'blur');
}

/** Steps 1 and 2: a name and a target of $1,800. */
async function toStepThree() {
  await fireEvent.changeText(screen.getByTestId('goal-name'), 'Trip to Lisbon');
  await fireEvent.press(screen.getByText('Continue'));
  await typeMoney('Target', '1800');
  await fireEvent.press(screen.getByText('Continue'));
}

describe('NewGoalSheet', () => {
  it('walks three steps with a step bar', async () => {
    await wrap(<NewGoalSheet visible onClose={jest.fn()} />);
    expect(screen.getByText('1 of 3')).toBeTruthy();
    expect(screen.getByText('What are you saving for?')).toBeTruthy();
    // Continue is disabled until there is a name
    expect(screen.getByText('Continue')).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId('goal-name'), 'Trip to Lisbon');
    await fireEvent.press(screen.getByText('Continue'));
    expect(screen.getByText('2 of 3')).toBeTruthy();
    expect(screen.getByText('How much?')).toBeTruthy();
    await typeMoney('Target', '1800');
    await fireEvent.press(screen.getByText('Continue'));
    expect(screen.getByText('3 of 3')).toBeTruthy();
    expect(screen.getByText('How will it fill?')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Back'));
    expect(screen.getByText('2 of 3')).toBeTruthy();
  });

  it('the icon tiles have spoken names and the By field has a MM/YYYY placeholder', async () => {
    await wrap(<NewGoalSheet visible onClose={jest.fn()} />);
    for (const name of ['Calendar', 'Laptop', 'Phone', 'Camera', 'Savings', 'Home', 'Transport', 'Headphones']) {
      expect(screen.getByLabelText(`${name} icon`)).toBeTruthy();
    }
    expect(screen.queryByLabelText(/^Icon /)).toBeNull();
    await toStepThree();
    expect(screen.getByTestId('pair-second-input').props.placeholder).toBe('MM/YYYY');
  });

  it('Make goal is disabled until a lock answer is chosen (D-23), and no option starts selected', async () => {
    await wrap(<NewGoalSheet visible onClose={jest.fn()} />);
    await toStepThree();
    const make = () => screen.getByLabelText('Make goal');
    expect(make().props.accessibilityState?.disabled).toBe(true);
    await fireEvent.press(make());
    expect(mockSave).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByText('No, Decide can count it'));
    expect(make().props.accessibilityState?.disabled).toBeFalsy();
  });

  it('saves the answer the user gave, the target and a monthly record; never the safety-net flag', async () => {
    const onClose = jest.fn();
    await wrap(<NewGoalSheet visible onClose={onClose} />);
    await toStepThree();
    await fireEvent.changeText(screen.getByTestId('pair-first-input'), '50');
    // the other field follows: $1,800 at $50 a month from 1 Nov 2026 is 36 deposits, the last in Oct 2029
    expect(screen.getByTestId('pair-second-input').props.value).toBe('Oct 2029');
    await fireEvent.press(screen.getByText('Yes, lock it'));
    await fireEvent.press(screen.getByLabelText('Make goal'));
    expect(mockSave).toHaveBeenCalledTimes(1);
    const arg = mockSave.mock.calls[0]![0] as { fields: Record<string, unknown>; series: Record<string, unknown> | null; ownerId: string; householdId: string };
    expect(arg.fields).toMatchObject({ name: 'Trip to Lisbon', locked: true, target: 180000, monthly_amount: 5000, opening_saved: 0, ready_by: '2029-10-31' });
    expect(arg.fields).not.toHaveProperty('is_safety_net');
    expect(arg.series).toMatchObject({ id: 'series-uuid', amount: 5000, anchor_date: '2026-11-16', category_id: 'cat-transfer' });
    expect(mockLight).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalled();
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ key: 'grow.goals.create.madeToast', stepId: 's-make', undoLabel: 'goalMade' }));
    expect(mockPush).toHaveBeenCalledWith('/grow/goal/new-goal');
  });

  it('the opposite answer is saved as not locked', async () => {
    await wrap(<NewGoalSheet visible onClose={jest.fn()} />);
    await toStepThree();
    await fireEvent.press(screen.getByText('No, Decide can count it'));
    await fireEvent.press(screen.getByLabelText('Make goal'));
    expect((mockSave.mock.calls[0]![0] as { fields: { locked: boolean } }).fields.locked).toBe(false);
  });

  it('turning the monthly record off sends no series', async () => {
    await wrap(<NewGoalSheet visible onClose={jest.fn()} />);
    await toStepThree();
    await fireEvent.changeText(screen.getByTestId('pair-first-input'), '50');
    await fireEvent.press(screen.getByLabelText('Record it each month for me to confirm'));
    await fireEvent.press(screen.getByText('Yes, lock it'));
    await fireEvent.press(screen.getByLabelText('Make goal'));
    expect((mockSave.mock.calls[0]![0] as { series: unknown }).series).toBeNull();
  });

  it('typing the By month works out the amount, rounded up', async () => {
    await wrap(<NewGoalSheet visible onClose={jest.fn()} />);
    await toStepThree();
    await fireEvent.changeText(screen.getByTestId('pair-second-input'), '12/2027');
    // 14 deposits from 1 Nov 2026 to Dec 2027: 180000 / 14 = 12857.1, rounded up to 12858
    expect(screen.getByTestId('pair-first-input').props.value).toBe('128.58');
  });

  it('an open-ended goal hides the By field and saves a null target and ready_by', async () => {
    await wrap(<NewGoalSheet visible onClose={jest.fn()} />);
    await fireEvent.changeText(screen.getByTestId('goal-name'), 'Rainy day');
    await fireEvent.press(screen.getByText('Continue'));
    await fireEvent.press(screen.getByLabelText('No set target. Save as you go.'));
    expect(screen.queryByLabelText('Target')).toBeNull();
    await fireEvent.press(screen.getByText('Continue'));
    expect(screen.queryByTestId('pair-second-input')).toBeNull();
    await fireEvent.press(screen.getByText('No, Decide can count it'));
    await fireEvent.press(screen.getByLabelText('Make goal'));
    const arg = mockSave.mock.calls[0]![0] as { fields: Record<string, unknown> };
    expect(arg.fields.target).toBeNull();
    expect(arg.fields.ready_by).toBeNull();
  });

  it('shows the total of the goals with the rule from Decide settings', async () => {
    await wrap(<NewGoalSheet visible onClose={jest.fn()} />);
    await toStepThree();
    await fireEvent.changeText(screen.getByTestId('pair-first-input'), '50');
    expect(screen.getByText('Your goals now total $200.00 a month. Your rule is at least $150.00.')).toBeTruthy();
  });

  it('closing mid-way asks Discard this goal?; Keep going stays', async () => {
    const onClose = jest.fn();
    await wrap(<NewGoalSheet visible onClose={onClose} />);
    await fireEvent.changeText(screen.getByTestId('goal-name'), 'Trip');
    await fireEvent.press(screen.getByLabelText('Close'));
    expect(screen.getByText('Discard this goal?')).toBeTruthy();
    await fireEvent.press(screen.getByText('Keep going'));
    expect(onClose).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByLabelText('Close'));
    await fireEvent.press(screen.getByText('Discard'));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(mockSave).not.toHaveBeenCalled();
  });

  it('a prefill from a Decide check fills the name and the target', async () => {
    await wrap(<NewGoalSheet visible onClose={jest.fn()} prefill={{ name: 'Laptop', target: 350000, checkId: 'c1' }} />);
    expect(screen.getByTestId('goal-name').props.value).toBe('Laptop');
  });

  it('a goal made from a Decide check is saved with that check id; one made by hand has none', async () => {
    await wrap(<NewGoalSheet visible onClose={jest.fn()} prefill={{ name: 'Laptop', target: 350000, checkId: 'c1' }} />);
    await fireEvent.press(screen.getByText('Continue'));
    await fireEvent.press(screen.getByText('Continue'));
    await fireEvent.press(screen.getByText('Yes, lock it'));
    await fireEvent.press(screen.getByLabelText('Make goal'));
    expect((mockSave.mock.calls[0]![0] as { fields: Record<string, unknown> }).fields).toMatchObject({ name: 'Laptop', target: 350000, check_id: 'c1' });
  });

  it('edit mode is one page, prefilled, and saves with the goal as it was (expected version)', async () => {
    const goal: SavingsGoalRow = goalFixture('', { id: 'g1', name: 'Trip to Lisbon', kind: 'pot', target: 180000, monthly_amount: 5000, locked: false, is_safety_net: false, account_id: 'a-sav', check_id: null, version: 4 });
    await wrap(<NewGoalSheet visible onClose={jest.fn()} goal={goal} saved={64000} />);
    expect(screen.queryByText('1 of 3')).toBeNull();
    expect(screen.getByTestId('goal-name').props.value).toBe('Trip to Lisbon');
    await fireEvent.changeText(screen.getByTestId('goal-name'), 'Lisbon in spring');
    await fireEvent.press(screen.getByLabelText('Save goal'));
    expect(mockSave).toHaveBeenCalledTimes(1);
    const arg = mockSave.mock.calls[0]![0] as { existing: SavingsGoalRow; fields: Record<string, unknown> };
    expect(arg.existing.version).toBe(4);
    expect(arg.fields).toEqual({ name: 'Lisbon in spring' });
  });

  it('edit mode refuses a target below what is saved', async () => {
    const goal: SavingsGoalRow = goalFixture('', { id: 'g1', name: 'Trip', kind: 'pot', target: 180000, locked: false, is_safety_net: false, check_id: null });
    await wrap(<NewGoalSheet visible onClose={jest.fn()} goal={goal} saved={64000} />);
    await typeMoney('Target', '500');
    expect(screen.getByText(/below what you.ve already saved/)).toBeTruthy();
    expect(screen.getByLabelText('Save goal').props.accessibilityState?.disabled).toBe(true);
  });

  it('P4-CR-03: a new target keeps the monthly amount and moves ready_by with it, so Decide and Grow read one plan', async () => {
    const goal: SavingsGoalRow = goalFixture('', { id: 'g1', name: 'Trip', kind: 'pot', target: 180000, monthly_amount: 5000, ready_by: '2029-01-31', locked: false, is_safety_net: false, check_id: null });
    await wrap(<NewGoalSheet visible onClose={jest.fn()} goal={goal} saved={64000} />);
    await typeMoney('Target', '2400');
    await fireEvent.press(screen.getByLabelText('Save goal'));
    // 1,760 left at 50 a month is 36 deposits from 1 Nov 2026: the last falls in Oct 2029.
    expect((mockSave.mock.calls[0]![0] as { fields: Record<string, unknown> }).fields).toEqual({ target: 240000, ready_by: '2029-10-31' });
  });

  it('P4-CR-03: with no monthly amount but a date, a new target moves the monthly amount instead (rounded up)', async () => {
    const goal: SavingsGoalRow = goalFixture('', { id: 'g1', name: 'Trip', kind: 'pot', target: 180000, monthly_amount: null, ready_by: '2027-12-31', locked: false, is_safety_net: false, check_id: null });
    await wrap(<NewGoalSheet visible onClose={jest.fn()} goal={goal} saved={64000} />);
    await typeMoney('Target', '2400');
    await fireEvent.press(screen.getByLabelText('Save goal'));
    // 1,760 over the 14 deposits Nov 2026 .. Dec 2027 is 125.714..., rounded up to the cent.
    expect((mockSave.mock.calls[0]![0] as { fields: Record<string, unknown> }).fields).toEqual({ target: 240000, monthly_amount: 12572 });
  });

  it('P4-CR-03: removing the target clears the date', async () => {
    const goal: SavingsGoalRow = goalFixture('', { id: 'g1', name: 'Trip', kind: 'pot', target: 180000, monthly_amount: 5000, ready_by: '2028-02-29', locked: false, is_safety_net: false, check_id: null });
    await wrap(<NewGoalSheet visible onClose={jest.fn()} goal={goal} saved={64000} />);
    await fireEvent.press(screen.getByLabelText('No set target. Save as you go.'));
    await fireEvent.press(screen.getByLabelText('Save goal'));
    expect((mockSave.mock.calls[0]![0] as { fields: Record<string, unknown> }).fields).toEqual({ target: null, ready_by: null });
  });

  it('P4-WR-09: in edit mode a changed target, icon or lock asks before Close drops it; no change closes at once', async () => {
    const goal: SavingsGoalRow = goalFixture('', { id: 'g1', name: 'Trip', kind: 'pot', target: 180000, locked: false, is_safety_net: false, check_id: null, icon: null });
    const onClose = jest.fn();
    await wrap(<NewGoalSheet visible onClose={onClose} goal={goal} saved={0} />);
    await typeMoney('Target', '2000');
    await fireEvent.press(screen.getByLabelText('Close'));
    expect(screen.getByText('Discard this goal?')).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('P4-WR-09: a changed icon alone also asks', async () => {
    const goal: SavingsGoalRow = goalFixture('', { id: 'g1', name: 'Trip', kind: 'pot', target: 180000, locked: false, is_safety_net: false, check_id: null, icon: null });
    const onClose = jest.fn();
    await wrap(<NewGoalSheet visible onClose={onClose} goal={goal} saved={0} />);
    await fireEvent.press(screen.getByTestId('goal-icon-laptop'));
    await fireEvent.press(screen.getByLabelText('Close'));
    expect(screen.getByText('Discard this goal?')).toBeTruthy();
  });

  it('P4-WR-09: an untouched edit closes at once', async () => {
    const goal: SavingsGoalRow = goalFixture('', { id: 'g1', name: 'Trip', kind: 'pot', target: 180000, locked: false, is_safety_net: false, check_id: null, icon: null });
    const onClose = jest.fn();
    await wrap(<NewGoalSheet visible onClose={onClose} goal={goal} saved={0} />);
    await fireEvent.press(screen.getByLabelText('Close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
