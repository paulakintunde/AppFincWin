/** Plan 05.3-24: /decide/purchase/[id] checks its params (T-05.3-24-01) and sits behind the v3 gate. */
import React from 'react';
import { render, screen } from '@testing-library/react-native';
import PurchaseRouteScreen from '../../../../../app/(app)/decide/purchase/[id]';

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
// 05.3-40: the layer cards pull in data hooks that read the env config; the route test only checks params and the gate.
jest.mock('@/features/decide/v3/layers/LayerStack', () => ({ LayerStack: () => null }));
jest.mock('@/features/decide/v3/check/CheckScreen', () => {
  const { Text: T } = jest.requireActual('react-native');
  return { CheckScreen: ({ id, focus }: { id: string; focus: string | null }) => <T>{`check:${id}:${String(focus)}`}</T> };
});

describe('/decide/purchase/[id]', () => {
  beforeEach(() => {
    mockV3 = true;
  });

  it('shows not found for an id that is not a uuid', async () => {
    mockParams = { id: 'not-a-uuid' };
    await render(<PurchaseRouteScreen />);
    expect(screen.getByText('not-found')).toBeTruthy();
  });

  it('renders the Check screen for a valid id and passes focus=price through', async () => {
    mockParams = { id: GOOD, focus: 'price' };
    await render(<PurchaseRouteScreen />);
    expect(screen.getByText(`check:${GOOD}:price`)).toBeTruthy();
  });

  it('drops any other focus value', async () => {
    mockParams = { id: GOOD, focus: 'name' };
    await render(<PurchaseRouteScreen />);
    expect(screen.getByText(`check:${GOOD}:null`)).toBeTruthy();
  });

  it('redirects to the Decide tab without the v3 switch', async () => {
    mockV3 = false;
    mockParams = { id: GOOD };
    await render(<PurchaseRouteScreen />);
    expect(screen.getByText('redirect:/decide')).toBeTruthy();
    expect(screen.queryByText(/^check:/)).toBeNull();
  });
});
