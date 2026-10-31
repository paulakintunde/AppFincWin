/** 05.3-90: one line per converted currency with its rate date; nothing when there are none. */
import React from 'react';
import { cleanup } from '@testing-library/react-native';
import { wrap } from '../../../check/steps/__tests__/helpers/stepProps';
import { RateNote } from '../RateNote';

jest.setTimeout(60000);

let mockConversions: { currency: string; rateText: string; rateDate: string }[] | null = null;
jest.mock('@/data/queries/decide', () => ({
  useDecideSnapshot: () => ({ result: mockConversions === null ? null : { conversions: mockConversions } }),
}));
jest.mock('../../shared/useV3Format', () => ({
  useV3Format: () => ({ date: (iso: string) => (iso === '2026-10-30' ? 'Oct 30, 2026' : iso) }),
}));

afterEach(() => {
  cleanup();
  mockConversions = null;
});

describe('RateNote', () => {
  it('names the currency and the rate date', async () => {
    mockConversions = [{ currency: 'GBP', rateText: '1.3', rateDate: '2026-10-30' }];
    const screen = await wrap(<RateNote />);
    expect(screen.getByText('GBP amounts use the rate from Oct 30, 2026, so these figures can move a little when rates change.')).toBeTruthy();
  });

  it('renders one line per currency, sorted by code', async () => {
    mockConversions = [
      { currency: 'GBP', rateText: '1.3', rateDate: '2026-10-30' },
      { currency: 'EUR', rateText: '1.1', rateDate: '2026-10-29' },
    ];
    const screen = await wrap(<RateNote />);
    const lines = screen.getAllByText(/amounts use the rate from/).map((n) => String(n.props.children));
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(/^EUR/);
    expect(lines[1]).toMatch(/^GBP/);
  });

  it('renders nothing with no conversions', async () => {
    mockConversions = [];
    const screen = await wrap(<RateNote />);
    expect(screen.queryByText(/amounts use the rate from/)).toBeNull();
  });

  it('renders nothing before the snapshot is ready', async () => {
    mockConversions = null;
    const screen = await wrap(<RateNote />);
    expect(screen.queryByText(/amounts use the rate from/)).toBeNull();
  });
});
