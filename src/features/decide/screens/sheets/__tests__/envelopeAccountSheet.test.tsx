// 06.1-43 (D-54, audit C-4): the envelope fix. Picking an account saves only account_id through Grow's writer, shows the undo toast
// and closes. The data hooks, writer, toast and haptics are mocked.
import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import { showToast } from '@/state/undoToast';
import { hapticLight } from '@/ui/haptics';
import { wrap } from '@/test/stepProps';
import { EnvelopeAccountSheet } from '../EnvelopeAccountSheet';

jest.setTimeout(30000);

const mockEdit = jest.fn((..._args: unknown[]) => 'step-1');
/** The shell binds Grow's useEditGoal the same way (AnswerRoute). */
const setAccount = (goal: unknown, accountId: string, ownerId: string): string => mockEdit(goal, { account_id: accountId }, ownerId, 0) as string;
let mockAccounts: unknown[] = [];
let mockGoals: unknown[] = [];
let mockUserId: string | null = 'user-1';

jest.mock('@/ui/haptics', () => ({ hapticLight: jest.fn() }));
jest.mock('@/state/undoToast', () => ({ showToast: jest.fn() }));
jest.mock('@/data/queries/accounts', () => ({ useAccounts: () => ({ data: mockAccounts }) }));
jest.mock('@/data/queries/growGoals', () => ({ useSavingsGoalRows: () => ({ data: mockGoals }) }));
jest.mock('@/features/record/useRecordContext', () => ({
  useRecordContext: () => ({ userId: mockUserId, householdId: 'hh-1', homeCurrency: 'USD' }),
}));

const account = (id: string, name: string, over: Record<string, unknown> = {}) => ({
  id,
  name,
  kind: 'checking',
  currency: 'USD',
  archived_at: null,
  deleted_at: null,
  ...over,
});
const GOAL = { id: 'g-env', household_id: 'hh-1', name: 'Holiday', account_id: null, deleted_at: null, version: 3, is_safety_net: false };

beforeEach(() => {
  mockEdit.mockClear();
  (showToast as jest.Mock).mockClear();
  (hapticLight as jest.Mock).mockClear();
  mockUserId = 'user-1';
  mockGoals = [GOAL];
  mockAccounts = [
    account('a-every', 'Everyday'),
    account('a-save', 'Savings', { kind: 'savings' }),
    account('a-card', 'Visa', { kind: 'credit' }),
    account('a-old', 'Old', { archived_at: '2026-01-01T00:00:00Z' }),
    account('a-gone', 'Gone', { deleted_at: '2026-01-01T00:00:00Z' }),
  ];
});

describe('EnvelopeAccountSheet', () => {
  it('renders nothing when hidden', async () => {
    await wrap(<EnvelopeAccountSheet goalId="g-env" visible={false} onClose={jest.fn()} setAccount={setAccount} />);
    expect(screen.queryByText('Which account holds Holiday?')).toBeNull();
  });

  it('lists only live money accounts as 44 px+ buttons named by the account', async () => {
    await wrap(<EnvelopeAccountSheet goalId="g-env" visible onClose={jest.fn()} setAccount={setAccount} />);
    expect(await screen.findByText('Which account holds Holiday?')).toBeTruthy();
    const every = screen.getByLabelText('Everyday');
    expect(every.props.accessibilityRole).toBe('button');
    expect(screen.getByLabelText('Savings')).toBeTruthy();
    expect(screen.queryByLabelText('Visa')).toBeNull();
    expect(screen.queryByLabelText('Old')).toBeNull();
    expect(screen.queryByLabelText('Gone')).toBeNull();
  });

  it('tapping an account saves only account_id, toasts with undo, taps a light haptic and closes', async () => {
    const onClose = jest.fn();
    await wrap(<EnvelopeAccountSheet goalId="g-env" visible onClose={onClose} setAccount={setAccount} />);
    await fireEvent.press(await screen.findByLabelText('Savings'));
    expect(mockEdit).toHaveBeenCalledTimes(1);
    expect(mockEdit).toHaveBeenCalledWith(GOAL, { account_id: 'a-save' }, 'user-1', 0);
    expect(showToast).toHaveBeenCalledWith({
      kind: 'ordinary',
      text: { key: 'grow.goals.detail.accountSavedToast', params: { account: 'Savings' } },
      stepId: 'step-1',
    });
    expect(hapticLight).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('with no accounts shows one line and no list', async () => {
    mockAccounts = [];
    await wrap(<EnvelopeAccountSheet goalId="g-env" visible onClose={jest.fn()} setAccount={setAccount} />);
    expect(await screen.findByText('No accounts yet.')).toBeTruthy();
    expect(screen.queryAllByRole('button').filter((b) => b.props.accessibilityLabel === 'Everyday')).toHaveLength(0);
  });

  it('writes nothing when the goal is gone', async () => {
    mockGoals = [];
    await wrap(<EnvelopeAccountSheet goalId="g-env" visible onClose={jest.fn()} setAccount={setAccount} />);
    await fireEvent.press(await screen.findByLabelText('Everyday'));
    expect(mockEdit).not.toHaveBeenCalled();
    expect(showToast).not.toHaveBeenCalled();
  });

  it('writes nothing when nobody is signed in', async () => {
    mockUserId = null;
    await wrap(<EnvelopeAccountSheet goalId="g-env" visible onClose={jest.fn()} setAccount={setAccount} />);
    await fireEvent.press(await screen.findByLabelText('Everyday'));
    expect(mockEdit).not.toHaveBeenCalled();
    expect(showToast).not.toHaveBeenCalled();
  });
});
