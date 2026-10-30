/** Plan 05.3-26 (D-06): the not-ready card orders, reads and opens its rows. */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { FontScaleProvider } from '@/theme/FontScaleProvider';
import type { Readiness } from '@/engine/decide/v3';
import { NotReadyCard } from '../NotReadyCard';

jest.setTimeout(60000);

const mockNavigate = jest.fn();
const mockPushOnce = jest.fn();
const mockTrack = jest.fn();
jest.mock('expo-router', () => ({ router: { navigate: (h: unknown) => mockNavigate(h), push: jest.fn() } }));
jest.mock('@/shell/navigation/pushOnce', () => ({ pushOnce: (h: unknown) => mockPushOnce(h) }));
jest.mock('@/services/analytics', () => ({ getAnalytics: () => ({ track: (...a: unknown[]) => mockTrack(...a) }) }));
jest.mock('@/features/decide/v3/nav/hrefs', () => ({ ENVELOPES_HREF: '/decide/envelopes' }));
jest.mock('@/features/decide/v3/shared/useV3Format', () => ({
  useV3Format: () => ({ month: (ym: string) => (ym === '2026-09' ? 'September' : ym === '2026-10' ? 'October' : ym) }),
}));

const wrap = (ui: React.ReactElement) =>
  <FontScaleProvider>
    <ThemeProvider>{ui}</ThemeProvider>
  </FontScaleProvider>;

const missing = (m: Readiness['missing']): Readiness => ({ ready: m.length === 0, missing: m }) as Readiness;
const ALL = missing(['activity_not_current', 'envelopes_unconfirmed', 'past_month_missing']);

beforeEach(() => jest.clearAllMocks());

describe('NotReadyCard', () => {
  it('orders rows last month, this month, envelopes from an alphabetical input', async () => {
    await render(wrap(<NotReadyCard readiness={ALL} thisMonth="2026-10" />));
    const buttons = screen.getAllByRole('button');
    expect(buttons.map((b) => b.props.accessibilityLabel)).toEqual([
      expect.stringMatching(/^Record September\. .+\. Open Activity$/),
      expect.stringMatching(/^Bring October up to date\. .+\. Open Activity$/),
      expect.stringMatching(/^Link your envelopes\. .+\. Open envelopes$/),
    ]);
    expect(screen.getByText('Before Decide can check a purchase:')).toBeTruthy();
    expect(screen.getByRole('header')).toBeTruthy();
  });

  it('opens Activity or the envelopes screen', async () => {
    await render(wrap(<NotReadyCard readiness={ALL} thisMonth="2026-10" />));
    await fireEvent.press(screen.getAllByRole('button')[0]!);
    expect(mockNavigate).toHaveBeenCalledWith('/activity');
    await fireEvent.press(screen.getAllByRole('button')[2]!);
    expect(mockPushOnce).toHaveBeenCalledWith('/decide/envelopes');
  });

  it('fires onReady once when the last row goes and tracks the first show once', async () => {
    const onReady = jest.fn();
    const r = await render(wrap(<NotReadyCard readiness={ALL} thisMonth="2026-10" onReady={onReady} />));
    expect(mockTrack).toHaveBeenCalledTimes(1);
    expect(mockTrack).toHaveBeenCalledWith('decide_not_ready_shown', { first: 'past_month_missing', count: '3' });
    await r.rerender(wrap(<NotReadyCard readiness={missing(['envelopes_unconfirmed'])} thisMonth="2026-10" onReady={onReady} />));
    expect(onReady).not.toHaveBeenCalled();
    expect(mockTrack).toHaveBeenCalledTimes(1);
    await r.rerender(wrap(<NotReadyCard readiness={missing([])} thisMonth="2026-10" onReady={onReady} />));
    await r.rerender(wrap(<NotReadyCard readiness={missing([])} thisMonth="2026-10" onReady={onReady} />));
    expect(onReady).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Before Decide can check a purchase:')).toBeNull();
  });

  it('renders nothing when ready from the start and never calls onReady', async () => {
    const onReady = jest.fn();
    await render(wrap(<NotReadyCard readiness={missing([])} thisMonth="2026-10" onReady={onReady} />));
    expect(screen.queryByRole('button')).toBeNull();
    expect(onReady).not.toHaveBeenCalled();
    expect(mockTrack).not.toHaveBeenCalled();
  });
});
