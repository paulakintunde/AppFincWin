// 05.3-100 (UAT gap 21): the lists' Check again reuses a copy only while that copy is still open.
import React from 'react';
import { render } from '@testing-library/react-native';
import type { DecideCheckRow } from '@/db/decideChecks';
import { resetPushOnceForTests, PUSH_GUARD_MS } from '@/shell/navigation/pushOnce';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  router: { push: (h: unknown) => mockPush(h), replace: jest.fn(), navigate: jest.fn(), back: jest.fn() },
}));
const mockReopen = jest.fn();
jest.mock('@/data/mutations/decideChecks', () => ({
  useReopenCheck: () => ({ reopen: (row: DecideCheckRow) => mockReopen(row) }),
}));
let mockChecks: DecideCheckRow[] = [];
jest.mock('@/data/queries/decide', () => ({
  useDecideChecks: () => ({ data: mockChecks }),
  useSavingsGoals: () => ({ data: [] }),
}));
jest.mock('@/features/record/useRecordContext', () => ({ useRecordContext: () => ({ userId: 'user-1', householdId: 'hh-1' }) }));
jest.mock('../../notifications/waitReminder', () => ({ cancelCheckReminders: jest.fn(async () => undefined) }));
jest.mock('../../past/useDeleteDecision', () => ({ useDeleteDecision: () => ({}) }));
jest.mock('@/state/undoToast', () => ({ showToast: jest.fn() }));

// eslint-disable-next-line import/first
import { useCheckAgain } from '../lists/useRowActions';

/** Mounts useCheckAgain and hands back the function it returns. */
async function mountCheckAgain(): Promise<(r: DecideCheckRow) => void> {
  let fn: ((r: DecideCheckRow) => void) | null = null;
  function Probe(): null {
    fn = useCheckAgain();
    return null;
  }
  await render(<Probe />);
  return (r) => fn!(r);
}

const row = (id: string, overrides: Partial<DecideCheckRow> = {}): DecideCheckRow =>
  ({ id, household_id: 'hh-1', created_by: 'user-1', status: 'passed', reopened_from: null, deleted_at: null, ...overrides }) as DecideCheckRow;

let now = 1000;
beforeEach(() => {
  mockPush.mockClear();
  mockReopen.mockReset();
  mockChecks = [];
  resetPushOnceForTests();
  now = 1000;
  jest.spyOn(Date, 'now').mockImplementation(() => now);
});
afterEach(() => jest.restoreAllMocks());

const press = (fn: () => void) => {
  now += PUSH_GUARD_MS;
  fn();
};

describe("the lists' Check again", () => {
  it('opens a copy that is still open without making another', async () => {
    mockChecks = [row('d1'), row('c1', { status: 'open', reopened_from: 'd1' })];
    const run = await mountCheckAgain();
    press(() => run(row('d1')));
    expect(mockReopen).not.toHaveBeenCalled();
    expect(JSON.stringify(mockPush.mock.calls[0]![0])).toContain('c1');
  });

  it('makes a new copy once the earlier copy is decided, every time', async () => {
    mockChecks = [row('d1'), row('c1', { status: 'waiting', reopened_from: 'd1' })];
    mockReopen.mockReturnValueOnce('n1').mockReturnValueOnce('n2');
    const run = await mountCheckAgain();
    press(() => run(row('d1')));
    mockChecks = [...mockChecks, row('n1', { status: 'passed', reopened_from: 'd1' })];
    const again = await mountCheckAgain();
    press(() => again(row('d1')));
    expect(mockReopen).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(mockPush.mock.calls[0]![0])).toContain('n1');
    expect(JSON.stringify(mockPush.mock.calls[1]![0])).toContain('n2');
  });
});
