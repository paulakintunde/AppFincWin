/** Plan 05.3-36: the Past decisions and Envelopes routes sit behind V3Gate (T-05.3-36-02). */
import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { DecisionsRoute } from '../DecisionsRoute';
import { EnvelopesRoute } from '../EnvelopesRoute';

let mockV3 = true;

jest.mock('expo-router', () => {
  const { Text: T } = jest.requireActual('react-native');
  return { Redirect: ({ href }: { href: string }) => <T>{`redirect:${href}`}</T> };
});
jest.mock('@/features/decide/useDecideAccess', () => ({ useDecideAccess: () => ({ v3: mockV3 }) }));
jest.mock('@/features/you/useProfile', () => ({ useProfile: () => ({ profile: null, loading: false }) }));
jest.mock('@/features/decide/v3/nav/V3Skeleton', () => ({ V3Skeleton: () => null }));
jest.mock('@/features/decide/v3/nav/hrefs', () => ({ DECIDE_TAB_HREF: '/decide' }));
jest.mock('@/features/decide/v3/lists/DecisionsScreen', () => {
  const { Text: T } = jest.requireActual('react-native');
  return { DecisionsScreen: () => <T>{'decisions-screen'}</T> };
});
jest.mock('@/features/decide/pots/PotsScreen', () => {
  const { Text: T } = jest.requireActual('react-native');
  return { PotsScreen: ({ titleKey }: { titleKey?: string }) => <T>{`pots:${titleKey ?? 'default'}`}</T> };
});
jest.mock('../../GoalTagEditProvider', () => ({ GoalTagEditProvider: ({ children }: { children: React.ReactNode }) => <>{children}</> }));

describe('DecisionsRoute and EnvelopesRoute', () => {
  it('render their screens with the v3 switch', async () => {
    mockV3 = true;
    await render(<DecisionsRoute />);
    expect(screen.getByText('decisions-screen')).toBeTruthy();
    await render(<EnvelopesRoute />);
    expect(screen.getByText('pots:decide.v3.ui.home.envelopes')).toBeTruthy();
  });

  it('redirect to the Decide tab without it', async () => {
    mockV3 = false;
    await render(<DecisionsRoute />);
    expect(screen.getByText('redirect:/decide')).toBeTruthy();
    expect(screen.queryByText('decisions-screen')).toBeNull();
    await render(<EnvelopesRoute />);
    expect(screen.queryByText(/^pots:/)).toBeNull();
  });
});
