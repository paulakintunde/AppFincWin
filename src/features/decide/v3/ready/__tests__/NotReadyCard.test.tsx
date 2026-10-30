/** Plans 05.3-26 (D-06) and 05.3-58 (D-24, D-29): the not-ready card asks about each gap and writes each answer once. */
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { FontScaleProvider } from '@/theme/FontScaleProvider';
import type { Readiness } from '@/engine/decide/v3';
import { NotReadyCard } from '../NotReadyCard';
import { NETFLIX, PAY, TODAY, evidence, readinessOf, SPENDING, LUNCH } from './notReadyKit';

jest.setTimeout(60000);

const mockTrack = jest.fn();
const mockAnswer = jest.fn();
jest.mock('@/services/analytics', () => ({ getAnalytics: () => ({ track: (...a: unknown[]) => mockTrack(...a) }) }));
jest.mock('@/features/decide/v3/shared/useV3Format', () => ({ useV3Format: () => jest.requireActual('./notReadyKit').fakeFormat }));
jest.mock('@/features/record/useRecordContext', () => ({ useRecordContext: () => ({ today: '2026-10-30', userId: 'u1', householdId: 'h1' }) }));
jest.mock('../useReadinessAnswer', () => ({
  useReadinessAnswer: () => ({ answer: (...a: unknown[]) => mockAnswer(...a), clearWaiver: jest.fn() }),
}));

const wrap = (ui: React.ReactElement) =>
  <FontScaleProvider>
    <ThemeProvider>{ui}</ThemeProvider>
  </FontScaleProvider>;

const missing = (m: Readiness['missing']): Readiness => ({ ready: m.length === 0, missing: m }) as Readiness;
const ALL = missing(['activity_not_current', 'envelopes_unconfirmed', 'past_month_missing']);

/** The chip buttons inside the item whose accessible text group starts with the title. */
function chipsOf(title: string): ReturnType<typeof screen.getAllByRole> {
  const group = screen.getByLabelText(new RegExp(`^${title}`));
  const item = group.parent!;
  return screen.getAllByRole('button').filter((b) => {
    for (let p = b.parent; p; p = p.parent) if (p === item) return true;
    return false;
  });
}
const disabledOf = (chips: ReturnType<typeof screen.getAllByRole>): boolean[] => chips.map((c) => c.props.accessibilityState?.disabled === true);

beforeEach(() => jest.clearAllMocks());

describe('NotReadyCard: code-only readiness (no named items)', () => {
  it('orders items last month, this month, envelopes from an alphabetical input', async () => {
    await render(wrap(<NotReadyCard readiness={ALL} thisMonth="2026-10" />));
    expect(screen.getByLabelText(/^Record September\. .+\.$/)).toBeTruthy();
    expect(screen.getByLabelText(/^Bring October up to date\. .+\.$/)).toBeTruthy();
    expect(screen.getByLabelText(/^Link your envelopes\. .+\.$/)).toBeTruthy();
    expect(screen.getAllByRole('button').map((b) => b.props.accessibilityLabel)).toEqual(['Open Activity', 'Open Activity', 'Open envelopes']);
    expect(screen.getByText('Before Decide can check a purchase:')).toBeTruthy();
    expect(screen.getByRole('header')).toBeTruthy();
  });

  it('Open Activity and Open envelopes go through the answer hook', async () => {
    await render(wrap(<NotReadyCard readiness={ALL} thisMonth="2026-10" />));
    await fireEvent.press(screen.getAllByRole('button')[0]!);
    expect(mockAnswer).toHaveBeenLastCalledWith(null, { kind: 'open', target: 'activity' }, expect.any(Function));
    await fireEvent.press(screen.getAllByRole('button')[2]!);
    expect(mockAnswer).toHaveBeenLastCalledWith(null, { kind: 'open', target: 'envelopes' }, expect.any(Function));
    // opening a screen never holds the chips
    expect(disabledOf(screen.getAllByRole('button'))).toEqual([false, false, false]);
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

describe('NotReadyCard: the asking card (D-24, D-29)', () => {
  it('renders the owner evidence under its months', async () => {
    await render(wrap(<NotReadyCard readiness={evidence()} thisMonth="2026-10" />));
    expect(screen.getByText('September')).toBeTruthy();
    expect(screen.getByText('October so far')).toBeTruthy();
    expect(screen.getByText('Income, $16,199.42, on 3 Sep')).toBeTruthy();
    expect(screen.getByText('Netflix, $11.99, due 3 Sep')).toBeTruthy();
    expect(screen.getByText('Lunch, $10.00, due 21 Sep')).toBeTruthy();
    expect(screen.getByText('Last everyday spending: 14 Oct.')).toBeTruthy();
    // D-29: a pending line makes the first chip the one-tap answer; "I'll record it" shows only without one
    expect(chipsOf('Netflix').map((c) => c.props.accessibilityLabel)).toEqual([
      'It was paid',
      'Someone else paid it',
      'It didn’t happen',
      'Someone else always pays this',
    ]);
    expect(chipsOf('Income').map((c) => c.props.accessibilityLabel)).toEqual(['It arrived', 'No pay this month', 'My money comes from elsewhere']);
    expect(screen.queryByText('I’ll record it')).toBeNull();
    expect(screen.getByLabelText('September is complete as it is')).toBeTruthy();
    expect(screen.getByLabelText('October is up to date as it is')).toBeTruthy();
  });

  it('shows I’ll record it when the bill has no pending line', async () => {
    const noLine = { ...NETFLIX, lineId: null };
    await render(wrap(<NotReadyCard readiness={readinessOf([noLine])} thisMonth="2026-10" />));
    expect(chipsOf('Netflix')[0]!.props.accessibilityLabel).toBe('I’ll record it');
    expect(screen.getByText('No payment recorded yet.')).toBeTruthy();
  });

  it('reads each item as one group: title (money through moneyA11y), status, question', async () => {
    await render(wrap(<NotReadyCard readiness={evidence()} thisMonth="2026-10" />));
    expect(screen.getByLabelText('Netflix, 11 dollars and 99 cents, due 3 Sep. Still marked Expected. Was it paid?')).toBeTruthy();
    expect(screen.getByLabelText('Everyday spending. Last everyday spending: 14 Oct. Anything more to add?')).toBeTruthy();
  });

  it('each chip calls answer once with its action', async () => {
    await render(wrap(<NotReadyCard readiness={evidence()} thisMonth="2026-10" />));
    await fireEvent.press(chipsOf('Netflix')[0]!);
    expect(mockAnswer).toHaveBeenCalledTimes(1);
    expect(mockAnswer).toHaveBeenCalledWith(NETFLIX, { kind: 'markPaid', lineId: 'netflix-sep' }, expect.any(Function));
  });

  it('Someone else paid it writes the paid_by_other waiver; the month link writes month_complete with no item', async () => {
    await render(wrap(<NotReadyCard readiness={evidence()} thisMonth="2026-10" />));
    await fireEvent.press(chipsOf('Lunch')[1]!);
    expect(mockAnswer).toHaveBeenCalledWith(
      LUNCH,
      { kind: 'waive', waiver: { kind: 'paid_by_other', seriesId: 'lunch', date: '2026-09-21' } },
      expect.any(Function),
    );
    await fireEvent.press(screen.getByLabelText('September is complete as it is'));
    expect(mockAnswer).toHaveBeenLastCalledWith(
      null,
      { kind: 'waive', waiver: { kind: 'month_complete', month: '2026-09', at: TODAY } },
      expect.any(Function),
    );
    expect(mockAnswer).toHaveBeenCalledTimes(2);
  });

  it('W3: chips are disabled while pending, enabled again when the write fails', async () => {
    await render(wrap(<NotReadyCard readiness={evidence()} thisMonth="2026-10" />));
    await fireEvent.press(chipsOf('Netflix')[0]!);
    expect(disabledOf(chipsOf('Netflix'))).toEqual([true, true, true, true]);
    // other items stay live
    expect(disabledOf(chipsOf('Lunch'))).toEqual([false, false, false, false]);
    const settle = mockAnswer.mock.calls[0]![2] as (ok: boolean) => void;
    await act(async () => settle(false));
    expect(disabledOf(chipsOf('Netflix'))).toEqual([false, false, false, false]);
  });

  it('W3: a successful write keeps the chips held until a new readiness arrives', async () => {
    const r = await render(wrap(<NotReadyCard readiness={evidence()} thisMonth="2026-10" />));
    await fireEvent.press(chipsOf('Netflix')[0]!);
    await fireEvent.press(chipsOf('Lunch')[2]!);
    const settle = mockAnswer.mock.calls[0]![2] as (ok: boolean) => void;
    await act(async () => settle(true));
    expect(disabledOf(chipsOf('Netflix'))).toEqual([true, true, true, true]);
    // a pressed disabled chip writes nothing more
    await fireEvent.press(chipsOf('Netflix')[0]!);
    expect(mockAnswer).toHaveBeenCalledTimes(2);
    await r.rerender(wrap(<NotReadyCard readiness={evidence()} thisMonth="2026-10" />));
    expect(disabledOf(chipsOf('Netflix'))).toEqual([false, false, false, false]);
    expect(disabledOf(chipsOf('Lunch'))).toEqual([false, false, false, false]);
  });

  it('an item leaves when it is waived; with no items left the card hides and onReady fires once', async () => {
    const onReady = jest.fn();
    const r = await render(wrap(<NotReadyCard readiness={evidence()} thisMonth="2026-10" onReady={onReady} />));
    await r.rerender(wrap(<NotReadyCard readiness={readinessOf([PAY, LUNCH, SPENDING])} thisMonth="2026-10" onReady={onReady} />));
    expect(screen.queryByText('Netflix, $11.99, due 3 Sep')).toBeNull();
    expect(screen.getByText('Lunch, $10.00, due 21 Sep')).toBeTruthy();
    await r.rerender(wrap(<NotReadyCard readiness={{ ready: true, missing: [], items: [], waived: [] }} thisMonth="2026-10" onReady={onReady} />));
    expect(screen.queryByText('Before Decide can check a purchase:')).toBeNull();
    expect(onReady).toHaveBeenCalledTimes(1);
  });
});
