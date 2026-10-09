import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { colors } from '@/theme/tokens';
import type { AccountRow } from '@/db/rows';
import { AccountRemoveRow } from '../AccountRemoveRow';

jest.setTimeout(30000);

jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const mockRemove = jest.fn((..._a: unknown[]) => 'step');
const mockEdit = jest.fn((..._a: unknown[]) => true);

jest.mock('@/data/mutations/accountDelete', () => ({ useDeleteAccount: () => ({ remove: mockRemove }) }));
jest.mock('@/data/mutations/accounts', () => ({ useEditAccount: () => ({ edit: mockEdit }) }));
jest.mock('@/data/mutations/undoCapture', () => ({ newStepId: () => 'step-1' }));
jest.mock('@/features/record/useRecordContext', () => ({
  useRecordContext: () => ({ userId: 'u1', householdId: 'h1', today: '2026-10-06', showCents: true }),
}));

const acc: AccountRow = {
  id: 'acc1', deleted_at: null, is_sample: false, household_id: 'h1', created_by: null, name: 'Everyday',
  kind: 'checking', currency: 'GBP', opening_balance: 0, archived_at: null, updated_by: null,
  overdraft_limit: null, credit_limit: null, version: 4, created_at: '', updated_at: '',
};

function wrap(usage: { liveLineCount: number; activeSeriesCount: number } | null, onDeleted = jest.fn()) {
  return render(
    <ThemeProvider>
      <AccountRemoveRow account={acc} usage={usage} onDeleted={onDeleted} />
    </ThemeProvider>
  );
}

beforeEach(() => jest.clearAllMocks());

describe('AccountRemoveRow (REC-24)', () => {
  it('deletes an empty account after the confirm, then leaves the screen', async () => {
    const onDeleted = jest.fn();
    const { getByText, getAllByText } = await wrap({ liveLineCount: 0, activeSeriesCount: 0 }, onDeleted);
    expect(getByText('Delete account').props.style.color).toBe(colors.danger);
    await fireEvent.press(getByText('Delete account'));
    expect(getByText('Delete Everyday? It has no transactions or repeating lines.')).toBeTruthy();
    const buttons = getAllByText('Delete account');
    await fireEvent.press(buttons[buttons.length - 1] as never);
    expect(mockRemove).toHaveBeenCalledWith(acc, { ownerId: 'u1', householdId: 'h1' });
    expect(onDeleted).toHaveBeenCalled();
  });

  it.each([
    [{ liveLineCount: 3, activeSeriesCount: 0 }, '3 transactions stay in your history.'],
    [{ liveLineCount: 1, activeSeriesCount: 0 }, '1 transaction stays in your history.'],
    [{ liveLineCount: 0, activeSeriesCount: 1 }, 'A repeating line uses this account.'],
    [{ liveLineCount: 2, activeSeriesCount: 1 }, '2 transactions and a repeating line use this account.'],
  ])('archives a used account (%j) with the reason', async (usage, reason) => {
    const { getByText, queryByText } = await wrap(usage);
    expect(queryByText('Delete account')).toBeNull();
    expect(getByText(reason)).toBeTruthy();
    await fireEvent.press(getByText('Archive account'));
    expect(mockEdit).toHaveBeenCalledTimes(1);
    const [vars] = mockEdit.mock.calls[0] as unknown as [{ patch: Record<string, unknown> }];
    expect(vars.patch).toEqual({ archived_at: '$now' });
    expect(mockRemove).not.toHaveBeenCalled();
  });

  it('never guesses while usage is unknown: Archive with no reason, no Delete', async () => {
    const { getByText, queryByText } = await wrap(null);
    expect(getByText('Archive account')).toBeTruthy();
    expect(queryByText('Delete account')).toBeNull();
    expect(queryByText(/stay in your history|repeating line/)).toBeNull();
  });
});
