// quick-261025-f46: the DECIDE_OPEN switch keeps the Decide tab but shows only the coming-soon screen.
// quick-261106-bf2 (owner 2026-11-06): DECIDE_OPEN is now true, so the route shows Decide home; the screen itself stays tested.
import React from 'react';
import { screen } from '@testing-library/react-native';
import en from '@/i18n/locales/en';
import { wrap } from '../../check/steps/__tests__/helpers/stepProps';
import { DECIDE_OPEN } from '../../availability';
import { DecideComingSoonScreen } from '../DecideComingSoonScreen';
import DecideRoute from '../../../../../app/(app)/(tabs)/decide';

jest.mock('@/features/decide/screens/home/DecideHome', () => {
  const R = jest.requireActual('react');
  const { Text: RNText } = jest.requireActual('react-native');
  return { DecideHome: () => R.createElement(RNText, null, 'decide-home') };
});
// 05.2-35: the route also imports the test-account setup page (and its data hooks, which need Supabase env). It is not drawn
// here: the switch is off for this account, so the Decide tab shows Coming soon.
jest.mock('@/features/decide/setup/DecideSetupPage', () => ({ DecideSetupPage: () => null }));
jest.mock('@/features/decide/useDecideAccess', () => ({ useDecideAccess: () => ({ v3: false }) }));
// D-27: the dev-only shadow export reads Supabase data; this test is about the visible screen only.
jest.mock('@/features/decide/dev/ShadowExportDevMenu', () => ({ ShadowExportDevMenu: () => null }));
// The real scaffold pulls in the avatar's Supabase client; the title and children are what matter here.
const mockTabProps: Record<string, unknown>[] = [];
jest.mock('@/shell/screen/TabRootScreen', () => {
  const R = require('react');
  const { View, Text: RNText } = require('react-native');
  return {
    TabRootScreen: (p: { title: string; children?: React.ReactNode } & Record<string, unknown>) => {
      mockTabProps.push(p);
      return R.createElement(View, null, R.createElement(RNText, null, p.title), p.children);
    },
  };
});

// decideCopy.test.ts BANNED patterns: the new copy must not read as advice or a credit offer.
const BANNED = [/\badvice\b/i, /\badvis/i, /recommend/i, /you should/i, /we suggest/i, /best option/i, /guaranteed/i, /\bapproved\b/i, /pre-approved/i, /\boffer/i, /apply for/i, /\blender\b/i, /loan offer/i, /interest-free/i];

describe('Decide coming-soon switch', () => {
  it('owner 2026-11-06: ships open', () => {
    expect(DECIDE_OPEN).toBe(true);
  });

  it('shows the header, heading and body', async () => {
    await wrap(<DecideComingSoonScreen />);
    expect(screen.getByText('Can I afford it')).toBeTruthy();
    expect(mockTabProps.at(-1)?.hideSyncLine).toBe(true);
    expect(screen.getByText('A better Decide is on its way')).toBeTruthy();
    expect(screen.getByText(en.decide.home.comingSoon.body)).toBeTruthy();
  });

  it('the Decide route renders Decide home, not the coming-soon screen', async () => {
    await wrap(<DecideRoute />);
    expect(screen.getByText('decide-home')).toBeTruthy();
    expect(screen.queryByText('A better Decide is on its way')).toBeNull();
  });

  it('uses no banned word', () => {
    for (const value of [en.decide.home.comingSoon.heading, en.decide.home.comingSoon.body]) {
      for (const re of BANNED) expect(value).not.toMatch(re);
    }
  });
});
