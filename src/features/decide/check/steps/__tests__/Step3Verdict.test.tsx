import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import { Step3Verdict, type Step3Props } from '../Step3Verdict';
import { WhatBreaksBody } from '../../sections/WhatBreaksSection';
import { buy, stepProps, wrap } from './helpers/stepProps';
import type { CheckInputs, SnapshotResult } from '../../../snapshot/types';
import { loggedSource, noneSource, roughSource, unconvertedSource } from '../../../snapshot/__tests__/helpers/snapshotFixtures';
import { hapticSuccess, hapticWarning } from '@/ui/haptics';

jest.setTimeout(30000);
jest.mock('@/ui/haptics', () => ({ hapticSuccess: jest.fn(), hapticWarning: jest.fn() }));
const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));

const loan = (price: number): Partial<CheckInputs> => ({
  advertised: price,
  method: 'loan',
  loan: { deposit: 0, termMonths: 12, aprText: '10', secured: false, securedTouched: true, aprFromQuick: false, promo: null, variable: false },
});

function propsFor(over: Partial<CheckInputs>, source: SnapshotResult, extra: Partial<Step3Props> = {}): Step3Props {
  const base = stepProps(buy(over), {}, source);
  // D-107: the outcome card is covered by its own tests below; the older tests read the verdict card alone, so they start without it
  return { ...base, computation: { ...base.computation, basisOutcomes: null }, lastSeenBasis: null, revealKey: 'k1', ...extra };
}

/** D-107: the same props with the real outcomes the engine computed in idle time. */
function withOutcomes(over: Partial<CheckInputs>, source: SnapshotResult, extra: Partial<Step3Props> = {}): Step3Props {
  const base = stepProps(buy(over), {}, source);
  return { ...base, lastSeenBasis: null, revealKey: 'k1', ...extra };
}

/** D-74: the warnings moved from the top of step 3 to the "What breaks" fold body; same cards, same copy. */
function breaks(p: Step3Props): React.JSX.Element {
  return <WhatBreaksBody computation={p.computation} inputs={p.inputs} update={p.update} whole={p.whole} exact={p.exact} currency={p.source.currency} readOnly={false} />;
}

describe('Step3Verdict', () => {
  beforeEach(() => jest.clearAllMocks());

  it('D-74 step 3 shows notices above the folds and no warning cards', async () => {
    const p = propsFor({ ...loan(2_000_000) }, loggedSource({ monthlyInvesting: 10_000 as never }));
    await wrap(<Step3Verdict {...p} />);
    expect(screen.getByText('Needs adjustment')).toBeTruthy();
    expect(screen.queryByText('Debt takes a large share of your income')).toBeNull();
    expect(screen.queryByText('Investing pauses to close the month')).toBeNull();
  });

  it('a fitting check shows the chip, the size label, the title and the basis marker, and one success haptic', async () => {
    await wrap(<Step3Verdict {...propsFor({ advertised: 150_000, method: 'cash' }, loggedSource())} />);
    expect(screen.getByText('It fits')).toBeTruthy();
    expect(screen.getByText('Out of this month’s spare')).toBeTruthy();
    expect(screen.getByText(/Average month/)).toBeTruthy();
    expect(hapticSuccess).toHaveBeenCalledTimes(1);
    expect(hapticWarning).not.toHaveBeenCalled();
  });

  it('the verdict live-region label never reads a doubled full stop', async () => {
    await wrap(<Step3Verdict {...propsFor({ advertised: 150_000, method: 'cash' }, loggedSource())} />);
    const label = screen.getAllByLabelText(/^It fits/)[0]!.props.accessibilityLabel as string;
    expect(label).toMatch(/Out of this month’s spare/);
    expect(label).not.toMatch(/\.\s*\./);
  });

  it('a first read announces without an empty sentence', async () => {
    await wrap(<Step3Verdict {...propsFor({ advertised: 150_000, method: 'cash' }, roughSource())} />);
    const label = screen.getByLabelText(/^Needs adjustment\. /).props.accessibilityLabel as string;
    expect(label).toBe('Needs adjustment. Out of this month’s spare. Your cash cushion breaks by 3000 dollars. First read · your figures');
    expect(label).not.toMatch(/\.\s*\./);
    expect(label).not.toMatch(/\.\s*$/);
  });

  it('adjust with two warnings renders the card and both warning titles, with a warning haptic', async () => {
    const p = propsFor({ ...loan(2_000_000) }, loggedSource({ monthlyInvesting: 10_000 as never }));
    await wrap(
      <>
        <Step3Verdict {...p} />
        {breaks(p)}
      </>
    );
    expect(screen.getByText('Needs adjustment')).toBeTruthy();
    expect(screen.getByText('Debt takes a large share of your income')).toBeTruthy();
    expect(screen.getByText('Investing pauses to close the month')).toBeTruthy();
    expect(hapticWarning).toHaveBeenCalledTimes(1);
  });

  it('the pause warning states the amount and never says should', async () => {
    const p = propsFor({ ...loan(2_000_000) }, loggedSource({ monthlyInvesting: 10_000 as never }));
    const view = await wrap(
      <>
        <Step3Verdict {...p} />
        {breaks(p)}
      </>
    );
    expect(screen.getByText(/The month closes only if .* a month of investing pauses/)).toBeTruthy();
    expect(JSON.stringify(view.toJSON()).toLowerCase()).not.toContain('should');
  });

  it('a no check uses the no chip', async () => {
    const p = propsFor(loan(3_000_000), loggedSource());
    await wrap(
      <>
        <Step3Verdict {...p} />
        {breaks(p)}
      </>
    );
    expect(screen.getByText('Doesn’t fit right now')).toBeTruthy();
    expect(screen.getByText('The month does not close')).toBeTruthy();
  });

  it('the haptic fires once per revealKey, not on re-render', async () => {
    const p = propsFor({ advertised: 150_000, method: 'cash' }, loggedSource());
    const view = await wrap(<Step3Verdict {...p} />);
    await view.rerender(<Step3Verdict {...p} />);
    expect(hapticSuccess).toHaveBeenCalledTimes(1);
    await view.rerender(<Step3Verdict {...p} revealKey="k2" />);
    expect(hapticSuccess).toHaveBeenCalledTimes(2);
  });

  it('a first read says what it rests on', async () => {
    const p = propsFor({ advertised: 150_000, method: 'cash' }, roughSource());
    expect(p.computation.status).toBe('first_read');
    await wrap(<Step3Verdict {...p} />);
    expect(screen.getByText('First read · your figures')).toBeTruthy();
  });

  it('IN-C05: a missing first read with no reason has the generic missing title', async () => {
    const p = propsFor({ advertised: 150_000, method: 'cash' }, roughSource());
    const fr = p.computation.firstRead!;
    const missing = { ...p, computation: { ...p.computation, firstRead: { ...fr, state: 'missing', reasons: [] } as never } };
    await wrap(<Step3Verdict {...missing} />);
    expect(screen.getByText('Some of the terms are missing, so this cannot be scored yet.')).toBeTruthy();
    expect(screen.queryByText('No card is chosen, so this cannot be scored yet.')).toBeNull();
  });

  it('a logged check last seen on the first read shows the new basis', async () => {
    await wrap(<Step3Verdict {...propsFor({ advertised: 150_000, method: 'cash' }, loggedSource(), { lastSeenBasis: 'first_read_rough_figures' })} />);
    expect(screen.getByText('Now from your logged months')).toBeTruthy();
  });

  it('none shows nothing to judge', async () => {
    const p = propsFor({ advertised: 150_000, method: 'cash' }, noneSource());
    expect(p.computation.status).toBe('none');
    await wrap(<Step3Verdict {...p} />);
    expect(screen.getByText('There is nothing to judge this against yet.')).toBeTruthy();
    expect(screen.queryByText('It fits')).toBeNull();
    expect(screen.queryByText(/First read/)).toBeNull();
    expect(hapticSuccess).not.toHaveBeenCalled();
  });

  it('a missing rate shows no figure on step 3', async () => {
    const p = propsFor({ advertised: 150_000, method: 'cash' }, unconvertedSource());
    expect(p.computation.status).toBe('unconverted');
    await wrap(<Step3Verdict {...p} />);
    expect(screen.getByText('Missing terms')).toBeTruthy();
    expect(screen.getByText(/No rate is stored for EUR/)).toBeTruthy();
    expect(screen.queryByText('It fits')).toBeNull();
    expect(screen.queryByText('Cash cushion broken')).toBeNull();
    await fireEvent.press(screen.getByText('See lines waiting for a rate'));
    expect(mockPush).toHaveBeenCalledWith('/activity');
  });

  it('WR-C05: the missing-rate link is its own link outside the summary group', async () => {
    await wrap(<Step3Verdict {...propsFor({ advertised: 150_000, method: 'cash' }, unconvertedSource())} />);
    const link = screen.getByRole('link');
    expect(link.props.accessibilityLabel ?? 'See lines waiting for a rate').toBeTruthy();
    await fireEvent.press(link);
    expect(mockPush).toHaveBeenCalledWith('/activity');
  });

  it('D-70: the confidence chip opens the reasons, with the Basis explanation at the top', async () => {
    await wrap(<Step3Verdict {...propsFor({ advertised: 150_000, method: 'cash' }, loggedSource())} />);
    await fireEvent.press(screen.getByLabelText(/^Basis: .*, tap for reasons$/));
    expect(screen.getAllByText('What this rests on').length).toBeGreaterThan(0);
    expect(screen.getByText('Basis')).toBeTruthy();
    expect(screen.getByText(/How much history the verdict rests on/)).toBeTruthy();
  });

  it('D-69: a provisional line shows the basis line with its count and date, Fair basis, and the reason on the sheet', async () => {
    const source: SnapshotResult = { ...loggedSource({ provisionalRates: true }), provisional: { rowCount: 2, rateDate: '2026-10-14' } };
    await wrap(<Step3Verdict {...propsFor({ advertised: 150_000, method: 'cash' }, source)} />);
    expect(screen.getByText(/2 lines converted at the on 2026-10-14 rate while their own rates load/)).toBeTruthy();
    expect(screen.getAllByText('Fair basis').length).toBeGreaterThan(0);
    await fireEvent.press(screen.getByLabelText(/^Basis: Fair basis/));
    expect(screen.getByText('Some lines use the latest stored rate until their own rate arrives')).toBeTruthy();
  });

  it('D-76 the verdict card clamps no system copy', async () => {
    await wrap(<Step3Verdict {...propsFor({ advertised: 150_000, method: 'cash' }, loggedSource())} />);
    const title = screen.getByText(/It clears every line/);
    expect(title.props.numberOfLines).toBeUndefined();
    expect(String(title.props.children).length).toBeLessThanOrEqual(64);
    expect(screen.getByText('It fits').props.numberOfLines).toBeUndefined();
    expect(screen.queryByText(/ in, .* out once this is running/)).toBeNull();
  });

  describe('D-107 the outcome on each basis', () => {
    const cash = { advertised: 150_000, method: 'cash' as const };

    it('D-107 Step 3 shows the outcome card after the basis row and before What breaks', async () => {
      const p = withOutcomes(cash, loggedSource());
      expect(p.computation.basisOutcomes).not.toBeNull();
      await wrap(
        <>
          <Step3Verdict {...p} />
          {breaks(p)}
        </>
      );
      expect(screen.getByText('The outcome on each basis')).toBeTruthy();
      expect(screen.getByTestId('basis-outcome-month')).toBeTruthy();
      expect(screen.getByTestId('basis-outcome-worst')).toBeTruthy();
      expect(screen.getByTestId('basis-outcome-average')).toBeTruthy();
    });

    it('D-107 the outcome card is hidden for a first read', async () => {
      const p = withOutcomes(cash, roughSource());
      expect(p.computation.status).toBe('first_read');
      await wrap(<Step3Verdict {...p} />);
      expect(screen.queryByText('The outcome on each basis')).toBeNull();
    });

    it("D-107 the outcome card follows the check's inputs after they settle", async () => {
      const first = withOutcomes(loan(600_000), loggedSource());
      const { rerender } = await wrap(<Step3Verdict {...first} busy />);
      const before = screen.getByTestId('basis-outcome-month').props.accessibilityLabel as string;
      const next = withOutcomes(loan(1_200_000), loggedSource());
      await rerender(<Step3Verdict {...next} />);
      expect(screen.getByTestId('basis-outcome-month').props.accessibilityLabel).not.toBe(before);
    });

    it('D-107 switching the Judge-on choice moves the chosen mark on an open check', async () => {
      const marked = async (judgeOn: 'month' | 'worst' | 'average'): Promise<string[]> => {
        const p = withOutcomes(cash, { ...loggedSource(), judgeOn });
        const { unmount } = await wrap(<Step3Verdict {...p} />);
        const chosen = (['month', 'worst', 'average'] as const).filter((b) => screen.getByTestId(`basis-outcome-${b}`).props.accessibilityState?.selected === true);
        await unmount();
        return chosen;
      };
      expect(await marked('month')).toEqual(['month']);
      expect(await marked('worst')).toEqual(['worst']);
      expect(await marked('average')).toEqual(['average']);
    });

    it('D-107 the reading order is verdict card, basis row, outcome card, What breaks', async () => {
      const p = withOutcomes(cash, loggedSource());
      await wrap(
        <>
          <Step3Verdict {...p} />
          {breaks(p)}
        </>
      );
      const json = JSON.stringify(screen.toJSON());
      const at = ['It fits', 'The outcome on each basis'].map((w) => json.indexOf(w));
      expect(at[0]).toBeGreaterThanOrEqual(0);
      expect(at[1]).toBeGreaterThan(at[0]!);
      expect(json.indexOf('Out of this month')).toBeLessThan(at[1]!);
    });

    it('D-107 Step 3 says This month is waiting for a rate under a fallback', async () => {
      const source: SnapshotResult = { ...loggedSource(), monthFallback: { currencies: ['EUR', 'GBP'] } };
      await wrap(<Step3Verdict {...withOutcomes(cash, source)} />);
      expect(screen.getByText('This month is waiting for a EUR, GBP rate')).toBeTruthy();
    });

    it('D-107 no waiting line without a fallback', async () => {
      await wrap(<Step3Verdict {...withOutcomes(cash, loggedSource())} />);
      expect(screen.queryByText(/is waiting for a/)).toBeNull();
    });
  });
});
