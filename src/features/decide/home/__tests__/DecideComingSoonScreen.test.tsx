// quick-261025-f46: the DECIDE_OPEN switch keeps the Decide tab but shows only the coming-soon screen.
import React from 'react';
import { screen } from '@testing-library/react-native';
import en from '@/i18n/locales/en';
import { wrap } from '../../check/steps/__tests__/helpers/stepProps';
import { DECIDE_OPEN } from '../../availability';
import { DecideComingSoonScreen } from '../DecideComingSoonScreen';
import DecideRoute from '../../../../../app/(app)/(tabs)/decide';

jest.mock('@/features/decide/home/DecideHomeScreen', () => {
  const R = jest.requireActual('react');
  const { Text: RNText } = jest.requireActual('react-native');
  return { DecideHomeScreen: () => R.createElement(RNText, null, 'old-decide') };
});
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
  it('ships closed', () => {
    expect(DECIDE_OPEN).toBe(false);
  });

  it('shows the header, heading and body', async () => {
    await wrap(<DecideComingSoonScreen />);
    expect(screen.getByText('Can I afford it')).toBeTruthy();
    expect(mockTabProps.at(-1)?.hideSyncLine).toBe(true);
    expect(screen.getByText('A better Decide is on its way')).toBeTruthy();
    expect(screen.getByText(en.decide.home.comingSoon.body)).toBeTruthy();
  });

  it('the Decide route renders the coming-soon screen, not today’s Decide', async () => {
    await wrap(<DecideRoute />);
    expect(screen.getByText('A better Decide is on its way')).toBeTruthy();
    expect(screen.queryByText('old-decide')).toBeNull();
  });

  it('uses no banned word', () => {
    for (const value of [en.decide.home.comingSoon.heading, en.decide.home.comingSoon.body]) {
      for (const re of BANNED) expect(value).not.toMatch(re);
    }
  });
});
