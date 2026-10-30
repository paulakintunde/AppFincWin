/** Plan 05.3-14: the v3 route gate (D-04): skeleton while loading, redirect without the switch, children with it. */
import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { V3Gate } from '../V3Gate';

let mockV3 = true;
let mockLoading = false;

jest.mock('expo-router', () => {
  const { Text: T } = jest.requireActual('react-native');
  return { Redirect: ({ href }: { href: string }) => <T>{`redirect:${href}`}</T> };
});
jest.mock('@/features/decide/useDecideAccess', () => ({ useDecideAccess: () => ({ v3: mockV3 }) }));
jest.mock('@/features/you/useProfile', () => ({ useProfile: () => ({ profile: null, loading: mockLoading }) }));
jest.mock('@/features/decide/v3/nav/V3Skeleton', () => {
  const { View: V } = jest.requireActual('react-native');
  return { V3Skeleton: () => <V testID="skeleton" accessibilityState={{ busy: true }} /> };
});
jest.mock('@/features/decide/v3/nav/hrefs', () => ({ DECIDE_TAB_HREF: '/decide' }));

function body(): React.JSX.Element {
  const { Text: T } = jest.requireActual('react-native');
  return <T>{'child'}</T>;
}

describe('V3Gate', () => {
  it('shows the skeleton while the profile loads, with no redirect and no children', async () => {
    mockLoading = true;
    mockV3 = false;
    await render(<V3Gate>{body()}</V3Gate>);
    expect(screen.getByTestId('skeleton')).toBeTruthy();
    expect(screen.queryByText('redirect:/decide')).toBeNull();
    expect(screen.queryByText('child')).toBeNull();
  });

  it('redirects to the Decide tab without the v3 switch', async () => {
    mockLoading = false;
    mockV3 = false;
    await render(<V3Gate>{body()}</V3Gate>);
    expect(screen.getByText('redirect:/decide')).toBeTruthy();
    expect(screen.queryByText('child')).toBeNull();
  });

  it('renders children with the v3 switch', async () => {
    mockLoading = false;
    mockV3 = true;
    await render(<V3Gate>{body()}</V3Gate>);
    expect(screen.getByText('child')).toBeTruthy();
    expect(screen.queryByTestId('skeleton')).toBeNull();
  });
});
