/** 05.4 BO-06: the setup page, engine readout and Decide settings are unreachable whatever profiles.decide_v3 says. */
import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { SetupRoute } from '../SetupRoute';
import { SettingsRoute } from '../SettingsRoute';
import DecideRoute from '../../../../app/(app)/(tabs)/decide';

let mockV3 = true;

jest.mock('expo-router', () => {
  const { Text: T } = jest.requireActual('react-native');
  return { Redirect: ({ href }: { href: string }) => <T>{`redirect:${href}`}</T>, useLocalSearchParams: () => ({}) };
});
jest.mock('@/features/decide/useDecideAccess', () => ({ useDecideAccess: () => ({ v3: mockV3 }) }));
jest.mock('@/features/decide/setup/DecideSetupPage', () => {
  const { Text: T } = jest.requireActual('react-native');
  return { DecideSetupPage: () => <T>{'WHAT DECIDE RECEIVES'}</T> };
});
jest.mock('@/features/decide/home/DecideComingSoonScreen', () => {
  const { Text: T } = jest.requireActual('react-native');
  return { DecideComingSoonScreen: () => <T>{'coming-soon'}</T> };
});
jest.mock('@/features/decide/settings/DecideSettingsScreen', () => {
  const { Text: T } = jest.requireActual('react-native');
  return { DecideSettingsScreen: () => <T>{'decide-settings'}</T> };
});
jest.mock('../SetupScreen', () => {
  const { Text: T } = jest.requireActual('react-native');
  return { SetupScreen: () => <T>{'setup-screen'}</T> };
});
jest.mock('@/features/decide/setup/DebtSheet', () => ({ DebtSheetHost: () => null }));
jest.mock('@/features/income/steps/EditSeriesFromProvider', () => ({ EditSeriesFromProvider: ({ children }: { children: unknown }) => children }));
jest.mock('@/features/decide/home/DecideHomeScreen', () => {
  const { Text: T } = jest.requireActual('react-native');
  return { DecideHomeScreen: () => <T>{'decide-home'}</T> };
});
jest.mock('@/features/decide/dev/ShadowExportDevMenu', () => ({ ShadowExportDevMenu: () => null }));
jest.mock('../SetupSheetHost', () => ({ useSetupSheetHost: jest.fn() }));

describe.each([true, false])('with decide_v3 %s', (flag) => {
  beforeEach(() => {
    mockV3 = flag;
  });

  // quick-261106-bf2 (owner 2026-11-06): DECIDE_OPEN is true, so the tab shows Decide home; the setup page stays hidden.
  it('the Decide tab shows Decide home, never the setup page or readout', async () => {
    await render(<DecideRoute />);
    expect(screen.getByText('decide-home')).toBeTruthy();
    expect(screen.queryByText('coming-soon')).toBeNull();
    expect(screen.queryByText('WHAT DECIDE RECEIVES')).toBeNull();
  });

  it('/decide/setup redirects to the Decide tab', async () => {
    await render(<SetupRoute />);
    expect(screen.getByText('redirect:/decide')).toBeTruthy();
    expect(screen.queryByText('setup-screen')).toBeNull();
  });

  it('/decide/settings redirects to the Decide tab', async () => {
    await render(<SettingsRoute />);
    expect(screen.getByText('redirect:/decide')).toBeTruthy();
    expect(screen.queryByText('decide-settings')).toBeNull();
  });
});
