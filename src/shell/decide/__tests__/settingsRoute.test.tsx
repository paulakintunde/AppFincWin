/** Plan 05.2-34: the /decide/settings route is gated on useDecideAccess().v3 (T-05.2-34-02). */
import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { SettingsRoute } from '../SettingsRoute';

let mockV3 = true;

jest.mock('expo-router', () => {
  const { Text: T } = jest.requireActual('react-native');
  return { Redirect: ({ href }: { href: string }) => <T>{`redirect:${href}`}</T> };
});
jest.mock('@/features/decide/useDecideAccess', () => ({ useDecideAccess: () => ({ v3: mockV3 }) }));
jest.mock('@/features/decide/settings/DecideSettingsScreen', () => {
  const { Text: T } = jest.requireActual('react-native');
  return { DecideSettingsScreen: () => <T testID="settings-screen" /> };
});

describe('SettingsRoute', () => {
  it('redirects to the Decide tab when the account does not have Decide v3', async () => {
    mockV3 = false;
    await render(<SettingsRoute />);
    expect(screen.getByText('redirect:/decide')).toBeTruthy();
    expect(screen.queryByTestId('settings-screen')).toBeNull();
  });

  it('shows Decide settings when the account has Decide v3', async () => {
    mockV3 = true;
    await render(<SettingsRoute />);
    expect(screen.getByTestId('settings-screen')).toBeTruthy();
  });
});
