/** 05.3-30: /decide/worked sits behind V3Gate. */
import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { WorkedRoute } from '../WorkedRoute';

let mockV3 = true;

jest.mock('expo-router', () => {
  const { Text: T } = jest.requireActual('react-native');
  return { Redirect: ({ href }: { href: string }) => <T>{`redirect:${href}`}</T> };
});
jest.mock('@/features/decide/useDecideAccess', () => ({ useDecideAccess: () => ({ v3: mockV3 }) }));
jest.mock('@/features/you/useProfile', () => ({ useProfile: () => ({ profile: null, loading: false }) }));
jest.mock('@/features/decide/v3/nav/hrefs', () => ({ DECIDE_TAB_HREF: '/decide' }));
jest.mock('@/features/decide/v3/worked/WorkedScreen', () => {
  const { Text: T } = jest.requireActual('react-native');
  return { WorkedScreen: () => <T>{'worked-body'}</T> };
});

describe('WorkedRoute', () => {
  it('renders the screen with the v3 switch', async () => {
    mockV3 = true;
    await render(<WorkedRoute />);
    expect(screen.getByText('worked-body')).toBeTruthy();
  });

  it('redirects to the Decide tab without it', async () => {
    mockV3 = false;
    await render(<WorkedRoute />);
    expect(screen.getByText('redirect:/decide')).toBeTruthy();
    expect(screen.queryByText('worked-body')).toBeNull();
  });
});
