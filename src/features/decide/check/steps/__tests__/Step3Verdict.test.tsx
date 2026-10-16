import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import { Step3Verdict, type Step3Props } from '../Step3Verdict';
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
  return { ...stepProps(buy(over), {}, source), lastSeenBasis: null, revealKey: 'k1', ...extra };
}

describe('Step3Verdict', () => {
  beforeEach(() => jest.clearAllMocks());

  it('a fitting check shows the chip, the size label, the title and the basis marker, and one success haptic', async () => {
    await wrap(<Step3Verdict {...propsFor({ advertised: 150_000, method: 'cash' }, loggedSource())} />);
    expect(screen.getByText('It fits')).toBeTruthy();
    expect(screen.getByText('Out of this month’s spare')).toBeTruthy();
    expect(screen.getByText(/Average month/)).toBeTruthy();
    expect(hapticSuccess).toHaveBeenCalledTimes(1);
    expect(hapticWarning).not.toHaveBeenCalled();
  });

  it('adjust with two warnings renders the card and both warning titles, with a warning haptic', async () => {
    const p = propsFor({ ...loan(2_000_000) }, loggedSource({ monthlyInvesting: 10_000 as never }));
    await wrap(<Step3Verdict {...p} />);
    expect(screen.getByText('Needs adjustment')).toBeTruthy();
    expect(screen.getByText('Debt takes a large share of your income')).toBeTruthy();
    expect(screen.getByText('Investing pauses to close the month')).toBeTruthy();
    expect(hapticWarning).toHaveBeenCalledTimes(1);
  });

  it('the pause warning states the amount and never says should', async () => {
    const p = propsFor({ ...loan(2_000_000) }, loggedSource({ monthlyInvesting: 10_000 as never }));
    const view = await wrap(<Step3Verdict {...p} />);
    expect(screen.getByText(/The month closes only if .* a month of investing pauses/)).toBeTruthy();
    expect(JSON.stringify(view.toJSON()).toLowerCase()).not.toContain('should');
  });

  it('a no check uses the no chip', async () => {
    await wrap(<Step3Verdict {...propsFor(loan(3_000_000), loggedSource())} />);
    expect(screen.getByText('You cannot afford this')).toBeTruthy();
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

  it('caps the title at three lines and the body at two, with a title of at most 64 characters', async () => {
    await wrap(<Step3Verdict {...propsFor({ advertised: 150_000, method: 'cash' }, loggedSource())} />);
    const title = screen.getByText(/It clears every line/);
    expect(title.props.numberOfLines).toBe(3);
    expect(String(title.props.children).length).toBeLessThanOrEqual(64);
    const body = screen.getByText(/ in, .* out once this is running/);
    expect(body.props.numberOfLines).toBe(2);
  });
});
