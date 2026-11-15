// 06.1-71 (CB-12, T-06.1-71-03): the answer's "No overdraft" write is bound here (useEditAccount reaches the rate-fetch door, which
// features/decide may not import): overdraft_limit = 0 on that account, with an undo step.
import React from 'react';
import { render } from '@testing-library/react-native';
import type { AnswerWrites } from '@/features/decide/screens/answer/AnswerScreen';
import type { AccountRow } from '@/db/rows';
import { AnswerRoute } from '../AnswerRoute';

let mockWrites: AnswerWrites | null = null;
jest.mock('@/features/decide/screens/answer/AnswerScreen', () => ({
  AnswerScreen: ({ writes }: { writes: AnswerWrites }) => {
    mockWrites = writes;
    return null;
  },
}));
jest.mock('../FirstAnswerGateBound', () => ({ FirstAnswerGateBound: () => null, NetQuestionBound: () => null }));
jest.mock('@/data/mutations/decideOutcome', () => ({ useNotBuying: () => ({ pass: jest.fn() }) }));
jest.mock('@/data/mutations/growGoals', () => ({ useEditGoal: () => ({ edit: jest.fn() }) }));
jest.mock('@/data/mutations/transactions', () => ({ useSkipOccurrence: () => ({ skip: jest.fn() }) }));
jest.mock('@/data/mutations/undoCapture', () => ({ newStepId: () => 'step-new' }));
let mockRecorded = true;
const mockEdit = jest.fn((..._a: unknown[]) => mockRecorded);
jest.mock('@/data/mutations/accounts', () => ({ useEditAccount: () => ({ edit: (...a: unknown[]) => mockEdit(...a) }) }));

const ACCOUNT = { id: 'a1', household_id: 'h1', version: 4, name: 'Everyday' } as unknown as AccountRow;

beforeEach(() => {
  mockWrites = null;
  mockRecorded = true;
  mockEdit.mockClear();
});

describe('AnswerRoute setNoOverdraft (06.1-71)', () => {
  it('writes overdraft_limit 0 on that account with an undo step and returns its id', async () => {
    await render(<AnswerRoute id="c1" />);
    expect(mockWrites?.setNoOverdraft(ACCOUNT, 'u1')).toBe('step-new');
    expect(mockEdit).toHaveBeenCalledWith(
      { id: 'a1', householdId: 'h1', expectedVersion: 4, patch: { overdraft_limit: 0 } },
      { stepId: 'step-new', ownerId: 'u1' }
    );
  });

  it('returns null when no undo step could be recorded (the write still goes)', async () => {
    mockRecorded = false;
    await render(<AnswerRoute id="c1" />);
    expect(mockWrites?.setNoOverdraft(ACCOUNT, 'u1')).toBeNull();
    expect(mockEdit).toHaveBeenCalledTimes(1);
  });
});
