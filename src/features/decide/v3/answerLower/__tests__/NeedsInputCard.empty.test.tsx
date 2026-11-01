/** 05.3-105 (UAT gap 29): a line whose text is empty renders no bullet; the others still render. */
import React from 'react';
import { screen } from '@testing-library/react-native';
import { wrap } from '@/features/decide/v3/answer/__tests__/kit';
import { returnToTab } from '@/shell/navigation/returnToTab';
import { NeedsInputCard } from '../NeedsInputCard';

jest.setTimeout(60000);

jest.mock('@/shell/navigation/pushOnce', () => ({ pushOnce: jest.fn() }));
jest.mock('expo-router', () => ({ useRootNavigationState: () => undefined, router: { navigate: jest.fn(), push: jest.fn() } }));
jest.mock('@/shell/navigation/returnToTab', () => ({ returnToTab: jest.fn() }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'uuid' }));
jest.mock('@/i18n', () => {
  const actual = jest.requireActual('@/i18n');
  return {
    ...actual,
    useT: () => (key: string, o?: Record<string, unknown>) => (key === 'test.blank' ? '   ' : (actual.i18n.t(key, o) as string)),
  };
});

describe('NeedsInputCard empty lines', () => {
  it('skips lines that translate to nothing and repeated lines', async () => {
    await wrap(
      <NeedsInputCard
        lines={['decide.v3.missing.records_look_behind', 'test.blank', 'decide.v3.missing.no_price', 'decide.v3.missing.no_price']}
        helpOffered={false}
        checkId="c1"
      />,
    );
    expect(screen.getAllByText('·')).toHaveLength(2);
    expect(screen.getByText('Your records look behind this month.')).toBeTruthy();
  });
});
