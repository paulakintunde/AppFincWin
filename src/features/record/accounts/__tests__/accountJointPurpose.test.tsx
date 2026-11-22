// 08.1-23 (CMP-F19, UX-21): the account sheet and the joint purpose. A joint account shows the group's purpose instead of the
// personal "What this account is for" row; saving an account with Joint newly on opens the purpose sheet in the sheet's place.
// Personal accounts are unchanged. The purpose sheet and row are stand-ins that show what they were given.
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import type { AccountRow } from '@/db/rows';
import { AccountSheet, type AccountSheetMode } from '../AccountSheet';

jest.setTimeout(30000);
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('@/features/decide/useDecideAccess', () => ({ useDecideAccess: () => ({ v3: true }) }));
const mockAdd = jest.fn((..._a: unknown[]) => 'new-id');
const mockEdit = jest.fn((..._a: unknown[]) => true);
jest.mock('@/data/mutations/accounts', () => ({ useAddAccount: () => ({ add: mockAdd }), useEditAccount: () => ({ edit: mockEdit }) }));
jest.mock('@/data/mutations/growHoldings', () => ({ useSetAccountRate: () => ({ set: jest.fn(() => 'rate-step') }) }));
jest.mock('@/data/mutations/accountUse', () => ({ useSaveAccountUse: () => ({ save: jest.fn() }) }));
jest.mock('@/data/mutations/undoCapture', () => ({ newStepId: () => 'step-1' }));
jest.mock('@/services/analytics', () => ({ getAnalytics: () => ({ track: jest.fn() }) }));
jest.mock('@/state/undoToast', () => ({ showToast: jest.fn() }));
jest.mock('@/data/queries/household', () => ({ useHouseholdMembers: () => ({ data: [{ user_id: 'u1' }, { user_id: 'u2' }] }) }));
jest.mock('@/features/household/rules/jointAccounts', () => ({ countMemberLinesOnAccount: jest.fn(async () => 0) }));
jest.mock('@/features/household/rules/JointPurposeRow', () => {
  const { Text } = jest.requireActual('react-native');
  return { JointPurposeRow: (p: { account: { id: string } }) => <Text testID="joint-purpose-row">{p.account.id}</Text> };
});
jest.mock('@/features/household/rules/JointPurposeSheet', () => {
  const { Text } = jest.requireActual('react-native');
  return {
    JointPurposeSheet: (p: { visible: boolean; account: { id: string; name: string }; current: unknown }) =>
      p.visible ? <Text testID="joint-purpose-sheet">{`${p.account.id}|${p.account.name}|${p.current === null ? 'unset' : 'set'}`}</Text> : null,
  };
});
jest.mock('@/data/queries/accounts', () => ({ useAccounts: () => ({ data: [] }) }));
jest.mock('@/data/queries/activity', () => ({ useAccountBalances: () => ({ balances: new Map(), isLoading: false }) }));
jest.mock('@/data/queries/decide', () => ({
  usePots: () => ({ data: { plain: [], live: [], wait: [], done: [] } }),
  useDecideSettings: () => ({ data: null }),
}));
jest.mock('@/data/queries/currencyOptions', () => ({ useCurrencyOptions: () => ({ options: [] }) }));
jest.mock('@/features/record/useRecordContext', () => ({
  useRecordContext: () => ({ householdId: 'h1', userId: 'u1', homeCurrency: 'GBP', region: 'GB', today: '2026-11-21', ready: true }),
}));

const account = (over: Partial<AccountRow> = {}): AccountRow =>
  ({
    id: 'acc1',
    household_id: 'h1',
    created_by: 'u1',
    name: 'Main',
    kind: 'checking',
    currency: 'GBP',
    opening_balance: 0,
    archived_at: null,
    overdraft_limit: null,
    credit_limit: null,
    deleted_at: null,
    is_shared: false,
    tombstone_of: null,
    version: 1,
    ...over,
  }) as AccountRow;

const onClose = jest.fn();
const show = (mode: AccountSheetMode) =>
  render(
    <ThemeProvider>
      <AccountSheet visible mode={mode} onClose={onClose} />
    </ThemeProvider>,
  );

beforeEach(() => {
  onClose.mockClear();
  mockAdd.mockClear();
  mockEdit.mockClear();
});

describe('account sheet: joint purpose', () => {
  it('shows the purpose row, not the personal use row, on a joint account', async () => {
    await show({ kind: 'edit', account: account({ is_shared: true }) });
    expect(screen.getByTestId('joint-purpose-row').props.children).toBe('acc1');
    expect(screen.queryByText('What this account is for')).toBeNull();
  });

  it('keeps the personal use row on a personal account', async () => {
    await show({ kind: 'edit', account: account() });
    expect(screen.queryByTestId('joint-purpose-row')).toBeNull();
    expect(screen.getByText('What this account is for')).toBeTruthy();
  });

  it('opens the purpose sheet, nothing picked, after a new joint account is saved', async () => {
    await show({ kind: 'new', context: 'later', joint: true });
    await fireEvent.changeText(screen.getByLabelText('Name'), 'Our bills');
    await fireEvent.press(screen.getByText('Save account'));
    expect(mockAdd).toHaveBeenCalledWith(expect.objectContaining({ is_shared: true, name: 'Our bills' }), expect.anything(), undefined);
    expect(screen.getByTestId('joint-purpose-sheet').props.children).toBe('new-id|Our bills|unset');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('opens the purpose sheet when an existing account is turned Joint', async () => {
    await show({ kind: 'edit', account: account() });
    await fireEvent.press(screen.getByRole('switch'));
    await fireEvent.press(screen.getByText('Save changes'));
    expect(screen.getByTestId('joint-purpose-sheet').props.children).toBe('acc1|Main|unset');
  });

  it('closes as before for a personal account', async () => {
    await show({ kind: 'new', context: 'later' });
    await fireEvent.changeText(screen.getByLabelText('Name'), 'Mine');
    await fireEvent.press(screen.getByText('Save account'));
    expect(screen.queryByTestId('joint-purpose-sheet')).toBeNull();
    expect(onClose).toHaveBeenCalled();
  });
});
