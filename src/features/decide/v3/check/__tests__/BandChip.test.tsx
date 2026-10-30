/** Plan 05.3-24: the band chip text and its live region, which changes only when the band number changes. */
import React from 'react';
import { act, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { Band, HomeThresholds, Layer } from '@/engine/decide/v3';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { BandChip, BAND_SETTLE_MS } from '../BandChip';

jest.setTimeout(60000);

jest.mock('@/features/record/useRecordContext', () => ({
  useRecordContext: () => ({ userId: 'u', householdId: 'h', homeCurrency: 'USD', showCents: false }),
}));
jest.mock('@/services/locale/deviceLocale', () => ({
  useDeviceLocale: () => ({ locale: 'en-US', timeZone: 'UTC', separators: { decimal: '.', group: ',' } }),
}));
jest.mock('../../shared/useV3Format', () => ({
  useV3Format: () => ({ money: (minor: number) => `$${Math.round(minor / 100).toLocaleString('en-US')}` }),
}));

const METRICS = { frame: { x: 0, y: 0, width: 402, height: 874 }, insets: { top: 0, bottom: 0, left: 0, right: 0 } };
// 14 edges in cents: $50, $100, $500, $1k, $5k, $10k, $20k, $50k, $100k, $500k, $1M, $2M, $5M, $10M
const EDGES = [5000, 10000, 50000, 100000, 500000, 1000000, 2000000, 5000000, 10000000, 50000000, 100000000, 200000000, 500000000, 1000000000];
const THRESHOLDS = { bandEdges: EDGES, unspentDrift: 0, quotedTolerance: 0, source: 'table' } as unknown as HomeThresholds;
const MISSING = { bandEdges: [], unspentDrift: 0, quotedTolerance: 0, source: 'missing' } as unknown as HomeThresholds;

function chip(band: Band | null, layers: Layer[] = ['L0', 'L1p', 'L2'], thresholds = THRESHOLDS) {
  return (
    <SafeAreaProvider initialMetrics={METRICS}>
      <ThemeProvider>
        <BandChip band={band} thresholds={thresholds} layers={layers} />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

const live = (): string => screen.getByTestId('band-chip').props.accessibilityLabel as string;

describe('BandChip', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('reads Band n with its range from the home thresholds and what it asks about', async () => {
    await render(chip(5));
    expect(screen.getByText('Band 5 · $1k–$5k')).toBeTruthy();
    expect(screen.getByText('Asks about: basics · purpose · value')).toBeTruthy();
    expect(live()).toContain('Band 5');
  });

  it('shows only the band number when thresholds are missing, and nothing without a band', async () => {
    await render(chip(5, ['L0'], MISSING));
    expect(screen.getByText('Band 5')).toBeTruthy();
    await screen.unmount();
    await render(chip(null));
    expect(screen.queryByTestId('band-chip')).toBeNull();
  });

  it('keeps one announcement for two prices in one band and a second when the band changes', async () => {
    const view = await render(chip(5));
    const first = live();
    await view.rerender(chip(5));
    await act(async () => {
      jest.advanceTimersByTime(BAND_SETTLE_MS + 10);
    });
    expect(live()).toBe(first);
    await view.rerender(chip(6, ['L0', 'L1p', 'L2', 'L5']));
    expect(live()).not.toBe(first);
    expect(live()).toContain('Band 6');
    expect(screen.getByTestId('band-chip').props.accessibilityLiveRegion).toBe('polite');
  });
});
