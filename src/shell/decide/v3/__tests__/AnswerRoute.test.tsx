/** Plan 05.3-41: /decide/answer/[id] checks its id (T-05.3-41-01), sits behind the v3 gate and wraps the screen in the record provider. */
import React from 'react';
import { render, screen } from '@testing-library/react-native';
import AnswerRouteScreen from '../../../../../app/(app)/decide/answer/[id]';

jest.setTimeout(60000);

const GOOD = '3f2b8c1e-5a4d-4e6f-8a9b-0c1d2e3f4a5b';
let mockParams: Record<string, string | string[] | undefined> = {};
let mockV3 = true;

jest.mock('expo-router', () => {
  const { Text: T } = jest.requireActual('react-native');
  return {
    useLocalSearchParams: () => mockParams,
    Redirect: ({ href }: { href: string }) => <T>{`redirect:${href}`}</T>,
  };
});
jest.mock('@/features/decide/useDecideAccess', () => ({ useDecideAccess: () => ({ v3: mockV3 }) }));
jest.mock('@/features/you/useProfile', () => ({ useProfile: () => ({ profile: null, loading: false }) }));
jest.mock('@/features/decide/v3/nav/V3Skeleton', () => ({ V3Skeleton: () => null }));
jest.mock('@/features/decide/v3/nav/hrefs', () => ({ DECIDE_TAB_HREF: '/decide' }));
jest.mock('@/features/decide/v3/nav/V3NotFound', () => {
  const { Text: T } = jest.requireActual('react-native');
  return { V3NotFound: () => <T>{'not-found'}</T> };
});
// The record provider pulls in the data writes (env config); only its place in the tree matters here.
jest.mock('@/shell/decide/V3RecordProvider', () => {
  const { View, Text: T } = jest.requireActual('react-native');
  return { V3RecordProvider: ({ children }: { children: React.ReactNode }) => <View><T>{'record-provider'}</T>{children}</View> };
});
jest.mock('@/features/decide/v3/answer/AnswerScreen', () => {
  const { Text: T } = jest.requireActual('react-native');
  return { AnswerScreen: ({ id }: { id: string }) => <T>{`answer:${id}`}</T> };
});

describe('/decide/answer/[id]', () => {
  beforeEach(() => {
    mockV3 = true;
  });

  it('shows not found for an id that is not a uuid', async () => {
    mockParams = { id: 'not-a-uuid' };
    await render(<AnswerRouteScreen />);
    expect(screen.getByText('not-found')).toBeTruthy();
    expect(screen.queryByText(/^answer:/)).toBeNull();
  });

  it('renders the Answer screen inside the record provider for a valid id', async () => {
    mockParams = { id: GOOD };
    await render(<AnswerRouteScreen />);
    expect(screen.getByText('record-provider')).toBeTruthy();
    expect(screen.getByText(`answer:${GOOD}`)).toBeTruthy();
  });

  it('redirects to the Decide tab without the v3 switch', async () => {
    mockV3 = false;
    mockParams = { id: GOOD };
    await render(<AnswerRouteScreen />);
    expect(screen.getByText('redirect:/decide')).toBeTruthy();
    expect(screen.queryByText(/^answer:/)).toBeNull();
    expect(screen.queryByText('record-provider')).toBeNull();
  });
});
