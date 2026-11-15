/**
 * 06.1 FIN-23 (owner D-26, 2026-11-12, AP-01..AP-06): a typed APR read the way UK and EU lenders quote it, when the region is set there.
 */
import fc from 'fast-check';
import { minorUnits } from '../../../../money/types';
import { ONE_HUNDRED_PERCENT, PERCENT_SCALE, ZERO_PERCENT, percent, percentFromScaled, rateDenominator } from '../../../../payoff/types';
import type { Cadence, PlanFees, Schedule } from '../../types';
import { BIWEEKLY, MONTHLY, QUARTERLY, WEEKLY, amortBase, scaledApr } from '../../plan/cadence';
import { EFFECTIVE_APR_COUNTRIES, effectiveAprArea, periodicRateFor } from '../../plan/rateConvention';
import { buildSchedule, exactInterestBp, type ScheduleInput } from '../../plan/schedule';

const NO_FEES: PlanFees = { setup: minorUnits(0), perPeriod: minorUnits(0), end: minorUnits(0) };

function build(over: Partial<ScheduleInput>): Schedule {
  const o = buildSchedule({ asOf: '2026-11-15', financed: minorUnits(1_000_000), apr: percent('6.6'), cadence: MONTHLY, count: 60, firstPayment: { kind: 'one_period' }, fees: NO_FEES, ...over });
  if (!o.ok) throw new Error(o.missing);
  return o.schedule;
}

/** (1 + x / D)^(base / every) against 1 + APR, compared exactly: -1 below, 0 equal, 1 above. */
function compounds(x: bigint, c: Cadence, apr: bigint): number {
  const base = amortBase(c);
  const D = rateDenominator(base);
  const left = (D + x) ** BigInt(base) * ONE_HUNDRED_PERCENT ** BigInt(c.every);
  const right = D ** BigInt(base) * (ONE_HUNDRED_PERCENT + apr) ** BigInt(c.every);
  return left < right ? -1 : left > right ? 1 : 0;
}

describe('effectiveAprArea', () => {
  it('the UK is uk, the 27 EU countries are eu, anything else (and no region) is null', () => {
    expect(effectiveAprArea('GB')).toBe('uk');
    expect(EFFECTIVE_APR_COUNTRIES).toHaveLength(28);
    for (const c of EFFECTIVE_APR_COUNTRIES.filter((x) => x !== 'GB')) expect(effectiveAprArea(c)).toBe('eu');
    for (const c of ['US', 'CA', 'AU', 'CH', 'NO']) expect(effectiveAprArea(c)).toBeNull();
    expect(effectiveAprArea(null)).toBeNull();
  });
});

describe('periodicRateFor', () => {
  it('US, Canada, other countries and no region keep today\'s reading (scaledApr)', () => {
    for (const country of ['US', 'CA', 'AU', null]) {
      for (const c of [MONTHLY, WEEKLY, BIWEEKLY, QUARTERLY]) expect(periodicRateFor(percent('6.6'), c, country)).toBe(scaledApr(percent('6.6'), c));
    }
  });

  it('0% stays 0 everywhere', () => {
    expect(periodicRateFor(ZERO_PERCENT, MONTHLY, 'GB')).toBe(0n);
    expect(periodicRateFor(ZERO_PERCENT, WEEKLY, 'DE')).toBe(0n);
  });

  it('Tesco Bank 6.6% APR (read 2026-11-12): the monthly rate is the bank\'s 6.4084% nominal a year', () => {
    const x = periodicRateFor(percent('6.6'), MONTHLY, 'GB');
    // x / (100 x 12 x PERCENT_SCALE) a month, so x / PERCENT_SCALE is the yearly nominal percent: 6.40838...%
    expect((x * 10_000n) / PERCENT_SCALE).toBe(64_083n);
    expect(compounds(x, MONTHLY, percent('6.6'))).toBeLessThanOrEqual(0);
    expect(compounds(x + 1n, MONTHLY, percent('6.6'))).toBe(1);
  });

  it('the result is the largest rate whose compounding does not pass 1 + APR, for any cadence (and under the nominal one)', () => {
    const cadenceArb: fc.Arbitrary<Cadence> = fc.record({ unit: fc.constantFrom('week' as const, 'month' as const), every: fc.integer({ min: 1, max: 4 }) });
    fc.assert(
      fc.property(fc.bigInt({ min: 1n, max: 60n * PERCENT_SCALE }).map(percentFromScaled), cadenceArb, fc.constantFrom(...EFFECTIVE_APR_COUNTRIES), (apr, c, country) => {
        const x = periodicRateFor(apr, c, country);
        expect(compounds(x, c, apr)).toBeLessThanOrEqual(0);
        expect(compounds(x + 1n, c, apr)).toBe(1);
        expect(x).toBeLessThan(scaledApr(apr, c));
      }),
      { numRuns: 60 }
    );
  });
});

describe('buildSchedule with a region (FIN-23)', () => {
  it('AP-01: Tesco Bank £10,000 over 60 months at 6.6% is £195.23 at the bank; the UK reading rounds up to £195.24', () => {
    expect(build({ country: 'GB' }).payment).toBe(19_524);
    expect(build({}).payment).toBe(19_614); // no region: today's reading
    expect(build({ country: null }).payment).toBe(19_614);
    expect(build({ country: 'US' }).payment).toBe(19_614);
  });

  it('AP-02: Consorsbank €10,000 over 36 months at 9.09% is €316.75 at the bank; the EU reading rounds up to €316.76', () => {
    expect(build({ country: 'DE', apr: percent('9.09'), count: 36 }).payment).toBe(31_676);
  });

  it('AP-05: £520 over 52 weeks at 19.9% is £10.96 a week read the UK way (£11.05 read as today)', () => {
    expect(build({ country: 'GB', apr: percent('19.9'), cadence: WEEKLY, count: 52, financed: minorUnits(52_000) }).payment).toBe(1_096);
    expect(build({ apr: percent('19.9'), cadence: WEEKLY, count: 52, financed: minorUnits(52_000) }).payment).toBe(1_105);
  });

  it('the exact interest share follows the rate used: under 10% read the UK way, over 10% read as today (AP-05)', () => {
    const uk = build({ country: 'GB', apr: percent('19.9'), cadence: WEEKLY, count: 52, financed: minorUnits(52_000) });
    const today = build({ apr: percent('19.9'), cadence: WEEKLY, count: 52, financed: minorUnits(52_000) });
    expect(uk.exactInterestBp).toBeLessThan(1_000);
    expect(today.exactInterestBp).toBeGreaterThan(1_000);
    expect(uk.exactInterestBp).toBe(exactInterestBp({ apr: periodicRateFor(percent('19.9'), WEEKLY, 'GB'), count: 52, base: 52, due: false, pausePeriods: 0 }));
  });
});
