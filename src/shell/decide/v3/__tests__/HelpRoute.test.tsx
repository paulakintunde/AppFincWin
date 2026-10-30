/** Plan 05.3-31 (D-17): the route redirects to the answer where a month is fully recorded, and shows the form otherwise. */
import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { roughInputs } from '@/features/decide/v3/help/__tests__/helpKit';
import { HelpRoute } from '../HelpRoute';

let mockInputs: unknown = null;
jest.mock('expo-router', () => {
  const { Text: T } = jest.requireActual('react-native');
  return { Redirect: ({ href }: { href: { pathname: string; params: { id: string } } }) => <T>{`redirect:${href.pathname}:${href.params.id}`}</T> };
});
jest.mock('../V3Gate', () => ({ V3Gate: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
jest.mock('@/data/queries/decideCheckV3', () => ({ useChecksV3: () => ({ inputs: mockInputs }) }));
jest.mock('@/features/decide/v3/nav/V3Skeleton', () => {
  const { View: V } = jest.requireActual('react-native');
  return { V3Skeleton: () => <V testID="skeleton" /> };
});
jest.mock('@/features/decide/v3/help/HelpScreen', () => {
  const { Text: T } = jest.requireActual('react-native');
  return { HelpScreen: () => <T>{'help-form'}</T> };
});

describe('HelpRoute', () => {
  it('shows the skeleton while inputs load', async () => {
    mockInputs = null;
    await render(<HelpRoute id="abc" />);
    expect(screen.getByTestId('skeleton')).toBeTruthy();
  });

  it('shows the form when no month is fully recorded', async () => {
    mockInputs = roughInputs({ full: false });
    await render(<HelpRoute id="abc" />);
    expect(screen.getByText('help-form')).toBeTruthy();
  });

  it('redirects to the answer when a month is fully recorded', async () => {
    mockInputs = roughInputs({ full: true });
    await render(<HelpRoute id="abc" />);
    expect(screen.getByText('redirect:/decide/answer/[id]:abc')).toBeTruthy();
    expect(screen.queryByText('help-form')).toBeNull();
  });
});
