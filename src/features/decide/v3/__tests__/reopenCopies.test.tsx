// 05.3-100 (UAT gap 21): repeated reopen copies. Screens follow a redirect, say so when a copy did not save, and the
// failure state shows. The lists are in reopenCopiesLists.test.tsx.
import React from 'react';
import { render } from '@testing-library/react-native';
import { resetPushOnceForTests } from '@/shell/navigation/pushOnce';

const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: (h: unknown) => mockReplace(h), navigate: jest.fn(), back: jest.fn() },
}));

jest.mock('@/services/supabase', () => ({ supabase: {} }));
jest.mock('@/services/analytics', () => ({ getAnalytics: () => ({ track: jest.fn() }) }));

jest.mock('@/services/auth/google', () => ({}));

let mockOutcome: { redirectTo: string | null; failed: boolean } = { redirectTo: null, failed: false };
jest.mock('../nav/useReopenOutcome', () => ({ useReopenOutcome: () => mockOutcome }));
jest.mock('../nav/V3CopyNotSaved', () => ({
  V3CopyNotSaved: () => {
    const { Text: T } = jest.requireActual('react-native');
    return <T>{'copy-not-saved'}</T>;
  },
}));
jest.mock('../nav/V3NotFound', () => ({
  V3NotFound: () => {
    const { Text: T } = jest.requireActual('react-native');
    return <T>{'not-found'}</T>;
  },
}));
jest.mock('../nav/V3Skeleton', () => ({
  V3Skeleton: () => {
    const { Text: T } = jest.requireActual('react-native');
    return <T>{'skeleton'}</T>;
  },
}));
jest.mock('@/data/queries/decideCheckV3', () => ({
  useCheckV3: () => ({ status: 'ready', row: null, evaluation: null, withoutRefunds: null, inputs: null }),
}));
jest.mock('@/shell/decide/v3/V3Gate', () => ({ V3Gate: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
jest.mock('../check/CheckScreen', () => ({
  CheckScreen: () => {
    const { Text: T } = jest.requireActual('react-native');
    return <T>{'check-screen'}</T>;
  },
}));
jest.mock('../layers/LayerStack', () => ({ LayerStack: () => null }));

// eslint-disable-next-line import/first
import { AnswerScreen } from '../answer/AnswerScreen';
// eslint-disable-next-line import/first
import { PurchaseRoute } from '@/shell/decide/v3/PurchaseRoute';

beforeEach(() => {
  mockReplace.mockClear();
  mockOutcome = { redirectTo: null, failed: false };
  resetPushOnceForTests();
});

describe('AnswerScreen on a reopen copy', () => {
  it('moves to the live copy the server returned, with no not-found screen', async () => {
    mockOutcome = { redirectTo: 'live-1', failed: false };
    const view = await render(<AnswerScreen id="tried" />);
    expect(mockReplace).toHaveBeenCalledTimes(1);
    expect(String(JSON.stringify(mockReplace.mock.calls[0]![0]))).toContain('live-1');
    expect(view.queryByText('not-found')).toBeNull();
  });

  it('shows the copy-not-saved state when the copy failed', async () => {
    mockOutcome = { redirectTo: null, failed: true };
    const view = await render(<AnswerScreen id="tried" />);
    expect(view.getByText('copy-not-saved')).toBeTruthy();
    expect(view.queryByText('not-found')).toBeNull();
  });

  it('still shows not-found for an unknown id', async () => {
    const view = await render(<AnswerScreen id="nope" />);
    expect(view.getByText('not-found')).toBeTruthy();
  });
});

describe('PurchaseRoute on a reopen copy', () => {
  it('follows the redirect with the price focused', async () => {
    mockOutcome = { redirectTo: 'live-1', failed: false };
    await render(<PurchaseRoute id="tried" focus="price" />);
    expect(mockReplace).toHaveBeenCalledTimes(1);
    const target = JSON.stringify(mockReplace.mock.calls[0]![0]);
    expect(target).toContain('live-1');
    expect(target).toContain('price');
  });

  it('shows the copy-not-saved state when the copy failed, else the check', async () => {
    mockOutcome = { redirectTo: null, failed: true };
    const failed = await render(<PurchaseRoute id="tried" focus="price" />);
    expect(failed.getByText('copy-not-saved')).toBeTruthy();
    failed.unmount();
    mockOutcome = { redirectTo: null, failed: false };
    const normal = await render(<PurchaseRoute id="c1" focus={null} />);
    expect(normal.getByText('check-screen')).toBeTruthy();
  });
});
