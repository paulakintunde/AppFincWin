import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import { Step3Verdict, type Step3Props } from '../steps/Step3Verdict';
import { buy, stepProps, wrap } from '../steps/__tests__/helpers/stepProps';
import { loggedSource, month, roughSource } from '../../snapshot/__tests__/helpers/snapshotFixtures';
import { minorUnits } from '@/engine/money';
import type { SnapshotResult } from '../../snapshot/types';

jest.setTimeout(30000);
jest.mock('@/ui/haptics', () => ({ hapticSuccess: jest.fn(), hapticWarning: jest.fn() }));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));

type Loose = Record<string, unknown>;

/** Six steady full months, so the engine reads a strong basis; a zero investing floor is not set (04 D-65), so no line sits on the edge. */
function strongSource(): SnapshotResult {
  const months = ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09'].map((m) => month(m, 500_000, 300_000));
  const pay = { seriesId: 's-pay', confirmed: true, freq: 'monthly', anchorDate: '2026-04-01', endDate: null, occurrenceCount: null, latestAmount: 500_000, currency: 'USD', lastPaidDate: '2026-10-01' } as never;
  const base = loggedSource({ cashOnHand: minorUnits(4_000_000), incomeSeries: [pay], months, monthlyInvesting: minorUnits(0), limits: { reserve: null, dsrLine: null, unsecuredIncomeMultiple: null, investingFloor: minorUnits(0), savingFloor: null, spareFloor: null } }, 4_000_000);
  return { ...base, meta: { ...base.meta, fullMonths: 6 } };
}

function propsFor(source: SnapshotResult = loggedSource(), extra: Partial<Step3Props> = {}): Step3Props {
  return { ...stepProps(buy({ advertised: 150_000, method: 'cash' }), {}, source), lastSeenBasis: null, revealKey: 'k1', ...extra };
}

/** Real computation with a few decision/verdict fields overridden (the engine fields these paths read). */
function withDecision(p: Step3Props, decisionOver: Loose, verdictOver: Loose = {}): Step3Props {
  const c = p.computation as unknown as { decision: Loose & { verdict: Loose }; verdict: Loose };
  const verdict = { ...c.verdict, ...verdictOver };
  const decision = { ...c.decision, ...decisionOver, verdict };
  return { ...p, computation: { ...p.computation, decision, verdict } as unknown as Step3Props['computation'] };
}

describe('verdict depth: step 3 top', () => {
  it('the demo verdict shows no depth lines', async () => {
    const p = propsFor(strongSource());
    expect(p.computation.status).toBe('logged');
    await wrap(<Step3Verdict {...p} />);
    expect(screen.getByText('Strong basis')).toBeTruthy();
    expect(screen.queryByText('On the edge')).toBeNull();
    expect(screen.queryByText(/on its own/)).toBeNull();
    expect(screen.queryByText(/the month is .* short/)).toBeNull();
    expect(screen.queryByText(/left out/)).toBeNull();
    expect(screen.queryByText(/Cash path unavailable/)).toBeNull();
  });

  it('a combined difference opens the body with the standalone reading', async () => {
    const base = propsFor(strongSource());
    const standalone = { ...(base.computation.verdict as unknown as Loose), state: 'fits' };
    const p = withDecision(base, { combinedDiffers: true, standalone, stacked: [{ status: 'applied' }] });
    await wrap(<Step3Verdict {...p} />);
    const body = screen.getByText(/Fits on its own; not with your other 1 open check/);
    expect(body.props.numberOfLines).toBe(2);
  });

  it('without a combined difference there is no such line', async () => {
    const base = propsFor(strongSource());
    const standalone = { ...(base.computation.verdict as unknown as Loose), state: 'fits' };
    const p = withDecision(base, { combinedDiffers: false, standalone, stacked: [{ status: 'applied' }] });
    await wrap(<Step3Verdict {...p} />);
    expect(screen.queryByText(/Fits on its own/)).toBeNull();
  });

  it('a worse future month leads the body when there is no combined difference', async () => {
    const p = withDecision(propsFor(strongSource()), { worstMonth: { month: '2027-06', differsFromNow: true, shortfall: 9_000 } });
    await wrap(<Step3Verdict {...p} />);
    expect(screen.getByText(/Fits now; from June the month is \$90 short\./)).toBeTruthy();
  });

  it('with a combined line the worst month moves to the basis row', async () => {
    const base = propsFor(strongSource());
    const standalone = { ...(base.computation.verdict as unknown as Loose), state: 'fits' };
    const p = withDecision(base, {
      combinedDiffers: true,
      standalone,
      stacked: [{ status: 'applied' }],
      worstMonth: { month: '2027-06', differsFromNow: true, shortfall: 9_000 },
    });
    await wrap(<Step3Verdict {...p} />);
    expect(screen.getByText('Fits now; from June the month is $90 short.')).toBeTruthy();
  });

  it('the chip row shows the strength, and tapping it opens the reasons and closes again', async () => {
    await wrap(<Step3Verdict {...propsFor(strongSource())} />);
    await fireEvent.press(screen.getByLabelText('Basis: Strong basis, tap for reasons'));
    expect(screen.getByText('What this rests on')).toBeTruthy();
    expect(screen.getByText('6 full months logged')).toBeTruthy();
    expect(screen.getAllByText(/Strong needs 6 full months/).length).toBeGreaterThan(0);
    await fireEvent.press(screen.getByText('Close'));
    expect(screen.queryByText('What this rests on')).toBeNull();
  });

  it('the reasons sheet lists one-offs left out and converted currencies', async () => {
    const base = propsFor(strongSource());
    const verdict = base.computation.verdict as unknown as { basisCodes: string[]; context: { money: Loose } };
    const p = withDecision(base, {}, {
      basisCodes: [...verdict.basisCodes, 'one_offs_excluded'],
      context: { ...verdict.context, money: { ...verdict.context.money, oneOffsExcluded: { count: 2 } } },
    });
    const source = { ...p.source, conversions: [{ currency: 'EUR', rateText: '1.4700000000', rateDate: '2026-10-14' }] } as SnapshotResult;
    await wrap(<Step3Verdict {...p} source={source} />);
    await fireEvent.press(screen.getByLabelText('Basis: Strong basis, tap for reasons'));
    expect(screen.getAllByText('2 one-offs left out').length).toBeGreaterThan(0);
    expect(screen.getByText('Includes amounts converted from EUR')).toBeTruthy();
  });

  it('an edge line adds the tag and names the margin, with the state unchanged', async () => {
    const p = withDecision(propsFor(strongSource()), { margins: [{ line: 'month', margin: 12_000, threshold: 0, flag: 'on_edge' }] });
    await wrap(<Step3Verdict {...p} />);
    expect(screen.getByText('On the edge')).toBeTruthy();
    expect(screen.getByText('It fits')).toBeTruthy();
    expect(screen.getByLabelText('It fits, on the edge: the month holds by $120')).toBeTruthy();
  });

  it('a first read still carries a rough basis chip', async () => {
    await wrap(<Step3Verdict {...propsFor(roughSource())} />);
    expect(screen.getByText('Rough basis')).toBeTruthy();
  });

  it('a pre-existing cash dip is a neutral fact, not a warning', async () => {
    const base = propsFor(strongSource());
    const v = base.computation.verdict as unknown as { facts: Loose[] };
    const p = withDecision(base, {}, { facts: [...v.facts, { code: 'cash_tight_before_payday', date: '2026-10-20', amount: 123_400 }] });
    await wrap(<Step3Verdict {...p} />);
    expect(screen.getByText(/Without this purchase, your cash is lowest on .*, at \$1234\./)).toBeTruthy();
  });

  it('the stacked wording applies when other checks are counted', async () => {
    const base = propsFor(strongSource());
    const v = base.computation.verdict as unknown as { facts: Loose[] };
    const p = withDecision(base, { stacked: [{ status: 'applied' }] }, { facts: [...v.facts, { code: 'cash_tight_before_payday', date: '2026-10-20', amount: 123_400 }] });
    await wrap(<Step3Verdict {...p} />);
    expect(screen.getByText(/and with your other open checks/)).toBeTruthy();
  });

  it('the deferred interest charge is a notice, not a warning', async () => {
    const base = propsFor(strongSource());
    const v = base.computation.verdict as unknown as { plan: Loose };
    const promo = {
      promoMonths: 12,
      deferredInterestCode: 'deferred_interest_charged',
      deferredInterestCharged: 25_000,
      paymentToClearInPromo: 10_000,
      paymentAfterPromo: 12_000,
      interestAfterPromo: 25_000,
      highestMonthlyPayment: 12_000,
      clearsBeforePromoEnd: false,
    };
    const p = withDecision(base, {}, { plan: { ...v.plan, promo } });
    await wrap(<Step3Verdict {...p} />);
    expect(screen.getByText('Interest charged back')).toBeTruthy();
    expect(screen.getByText(/If the balance isn’t cleared when the 12-month promotion ends, \$250 of interest is charged back\./)).toBeTruthy();
  });

  it('shows one-offs left out and converted amounts on one basis line', async () => {
    const base = propsFor(strongSource());
    const verdict = base.computation.verdict as unknown as { basisCodes: string[]; context: { money: Loose } };
    const p = withDecision(base, {}, {
      basisCodes: [...verdict.basisCodes, 'one_offs_excluded'],
      context: { ...verdict.context, money: { ...verdict.context.money, oneOffsExcluded: { count: 2 } } },
    });
    const source = { ...p.source, conversions: [{ currency: 'EUR', rateText: '1.4700000000', rateDate: '2026-10-14' }] } as SnapshotResult;
    await wrap(<Step3Verdict {...p} source={source} />);
    const row = screen.getByText(/^2 one-offs left out · Includes amounts converted from EUR at 1\.47 on /);
    expect(row.props.numberOfLines).toBe(1);
  });

  it('the card minimum basis item opens the card terms', async () => {
    const base = propsFor(strongSource());
    const meta = { ...base.source.meta, cardsWithoutMinimum: 1 };
    const source = { ...base.source, meta } as SnapshotResult;
    const onEdit = jest.fn();
    const view = await wrap(<Step3Verdict {...base} source={source} onEditCardMinimum={onEdit} />);
    expect(screen.getByText(/Card payments not counted until the minimum is set/)).toBeTruthy();
    await fireEvent.press(screen.getByLabelText(/Card payments not counted until the minimum is set/));
    expect(onEdit).toHaveBeenCalledTimes(1);
    await view.rerender(<Step3Verdict {...base} source={source} />);
    expect(screen.queryByLabelText(/Card payments not counted/)).toBeNull();
    expect(screen.getByText(/Card payments not counted/)).toBeTruthy();
    const none = await wrap(<Step3Verdict {...base} onEditCardMinimum={onEdit} />);
    expect(none.queryByText(/Card payments not counted/)).toBeNull();
  });
});
