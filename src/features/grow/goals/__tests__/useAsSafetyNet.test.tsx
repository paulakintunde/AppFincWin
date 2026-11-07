// 06-22 (D-29, GRW-02): "Use as my safety net" on an existing goal. The Decide effect is stated in plain words BEFORE any save,
// a swap is named when a net already exists, dismissing writes nothing, and confirming makes exactly one save and one Undo.
import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import type { SavingsGoalRow } from '@/db/savingsGoals';
import { wrap } from '@/features/decide/check/steps/__tests__/helpers/stepProps';
import { goal as goalFixture } from '@/features/decide/past/__tests__/helpers/pastFixtures';
import { UseAsSafetyNetSheet } from '../UseAsSafetyNetSheet';

jest.setTimeout(30000);

const mockSet = jest.fn((..._a: unknown[]) => 's-net' as string | null);
const mockLight = jest.fn();
jest.mock('@/data/mutations/growGoals', () => ({
  useSetSafetyNet: () => ({ set: (...a: unknown[]) => mockSet(...a) }),
}));
jest.mock('@/ui/haptics', () => ({
  hapticSelection: jest.fn(),
  hapticLight: () => mockLight(),
  hapticWarning: jest.fn(),
  hapticSuccess: jest.fn(),
  hapticMedium: jest.fn(),
}));

const lisbon = (over: Partial<SavingsGoalRow> = {}): SavingsGoalRow =>
  goalFixture('', { id: 'g1', name: 'Trip to Lisbon', kind: 'pot', locked: false, is_safety_net: false, check_id: null, ...over });
const net = (): SavingsGoalRow =>
  goalFixture('', { id: 'net', name: 'Safety net', kind: 'pot', locked: true, is_safety_net: true, check_id: null });

async function open(goal: SavingsGoalRow, currentNet: SavingsGoalRow | null, onClose = jest.fn(), onSet = jest.fn()) {
  await wrap(
    <UseAsSafetyNetSheet visible goal={goal} currentNet={currentNet} ownerId="u1" savedText="$800" netSavedText="$1,300" onClose={onClose} onSet={onSet} />
  );
  return { onClose, onSet };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSet.mockReturnValue('s-net');
});

describe('UseAsSafetyNetSheet', () => {
  it('an unlocked goal: says it becomes Locked and Decide keeps its money out of spare money, before any save', async () => {
    await open(lisbon(), null);
    expect(screen.getByText(/This goal becomes Locked\. Decide will keep its \$800 out of spare money\./)).toBeTruthy();
    expect(screen.queryByText(/becomes a normal goal/)).toBeNull();
    expect(mockSet).not.toHaveBeenCalled();
  });

  it('an already locked goal: says Decide already keeps it and it becomes the net', async () => {
    await open(lisbon({ locked: true }), null);
    expect(screen.getByText(/Decide already keeps its \$800 out of spare money\. It becomes your safety net\./)).toBeTruthy();
  });

  it('when a net exists: names the swap, the old net becomes a normal goal and stays Locked', async () => {
    await open(lisbon(), net());
    expect(screen.getByText(/Your current safety net, Safety net \(\$1,300\), becomes a normal goal and stays Locked\./)).toBeTruthy();
  });

  it('Keep as is closes and writes nothing', async () => {
    const { onClose, onSet } = await open(lisbon(), net());
    await fireEvent.press(screen.getByText('Keep as is'));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSet).not.toHaveBeenCalled();
    expect(mockSet).not.toHaveBeenCalled();
  });

  it('confirming makes one save with the goal and the current net, a light haptic, and reports the undo step', async () => {
    const goal = lisbon();
    const current = net();
    const { onClose, onSet } = await open(goal, current);
    await fireEvent.press(screen.getAllByText('Use as my safety net').at(-1)!);
    expect(mockSet).toHaveBeenCalledTimes(1);
    expect(mockSet).toHaveBeenCalledWith(goal, current, 'u1');
    expect(mockLight).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSet).toHaveBeenCalledWith('s-net');
  });

  it('with no existing net the save is given null for the current net', async () => {
    await open(lisbon(), null);
    await fireEvent.press(screen.getAllByText('Use as my safety net').at(-1)!);
    expect(mockSet).toHaveBeenCalledWith(expect.anything(), null, 'u1');
  });
});
