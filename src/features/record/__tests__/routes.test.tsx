// 02-29: the Record screens are plain routes in the signed-in group, and the layout mounts the
// undo toast host exactly once (D-31). Screens and the host are mocked so this checks wiring only.
import React from 'react';
import { render } from '@testing-library/react-native';

const mockPush = jest.fn();
const mockReplace = jest.fn();
let mockParams: Record<string, string | undefined> = {};

jest.mock('expo-router', () => {
  const R = require('react');
  const Stack = ({ children }: { children?: React.ReactNode }) => R.createElement(R.Fragment, null, children);
  Stack.Screen = () => null;
  return {
    router: { push: (...a: unknown[]) => mockPush(...a), replace: (...a: unknown[]) => mockReplace(...a) },
    useLocalSearchParams: () => mockParams,
    usePathname: () => '/activity',
    Redirect: () => null,
    Stack,
  };
});

const mockImportScreen = jest.fn((_props: unknown) => null);
jest.mock('@/features/record/import/ImportScreen', () => ({
  ImportScreen: (props: unknown) => mockImportScreen(props),
}));
const mockAccountDetail = jest.fn((_props: unknown) => null);
jest.mock('@/features/record/accounts/AccountDetailScreen', () => ({
  AccountDetailScreen: (props: unknown) => mockAccountDetail(props),
}));
const mockActivity = jest.fn((_props: unknown) => null);
jest.mock('@/features/record/activity/ActivityScreen', () => ({
  ActivityScreen: (props: unknown) => mockActivity(props),
}));
jest.mock('@/features/record/history/UndoToastHost', () => {
  const R = require('react');
  const { View } = require('react-native');
  return { UndoToastHost: () => R.createElement(View, { testID: 'undo-toast-host' }) };
});
jest.mock('@/features/consent/useConsent', () => ({
  useConsent: () => ({ loading: false, needsPrompt: false }),
}));

import ImportRoute from '../../../../app/(app)/import';
import AccountDetailRoute from '../../../../app/(app)/accounts/[id]';
import ActivityRoute from '../../../../app/(app)/activity';
import AppLayout from '../../../../app/(app)/_layout';

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = {};
});

describe('import route', () => {
  it.each(['onboarding', 'you', 'account'])('passes the %s entry through', (entry) => {
    mockParams = { entry, accountId: 'acc-1' };
    render(<ImportRoute />);
    expect(mockImportScreen).toHaveBeenCalledWith(expect.objectContaining({ entry, accountId: 'acc-1' }));
  });

  it('maps an unknown or missing entry to you, and a missing accountId to null', () => {
    mockParams = { entry: 'evil' };
    render(<ImportRoute />);
    expect(mockImportScreen).toHaveBeenCalledWith(expect.objectContaining({ entry: 'you', accountId: null }));
    mockParams = {};
    render(<ImportRoute />);
    expect(mockImportScreen).toHaveBeenLastCalledWith(expect.objectContaining({ entry: 'you' }));
  });

  it('returns to Activity when done', () => {
    render(<ImportRoute />);
    (mockImportScreen.mock.calls[0]![0] as { onDone: () => void }).onDone();
    expect(mockReplace).toHaveBeenCalledWith('/activity');
  });
});

describe('record routes', () => {
  it('account detail reads the id and opens import with the account entry', () => {
    mockParams = { id: 'acc-9' };
    render(<AccountDetailRoute />);
    const props = mockAccountDetail.mock.calls[0]![0] as { accountId: string; onImport: (id: string) => void };
    expect(props.accountId).toBe('acc-9');
    props.onImport('acc-9');
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/import', params: { entry: 'account', accountId: 'acc-9' } });
  });

  it('activity navigates to accounts, history and you', () => {
    render(<ActivityRoute />);
    const p = mockActivity.mock.calls[0]![0] as Record<string, () => void>;
    p.onOpenAccounts!();
    p.onOpenHistory!();
    p.onOpenYou!();
    expect(mockPush.mock.calls.map((c) => c[0])).toEqual(['/accounts', '/history', '/you']);
  });
});

describe('signed-in layout', () => {
  it('mounts exactly one UndoToastHost', () => {
    const { getAllByTestId } = render(<AppLayout />);
    expect(getAllByTestId('undo-toast-host')).toHaveLength(1);
  });
});
