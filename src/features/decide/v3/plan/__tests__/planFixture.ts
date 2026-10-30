// 05.3-28: test fixture for the whole-plan screen: Sam's used car built from the engine's own schedule and plan card.
import { buildSchedule, planCard } from '@/engine/decide/v3';
import type { Cadence, Purchase, QuotedCheck } from '@/engine/decide/v3';
import { minorUnits } from '@/engine/money';
import { percent } from '@/engine/payoff';

const mu = minorUnits;

export interface Fixture {
  rate: string;
  count: number;
  cadence: Cadence;
  quoted: QuotedCheck;
  running: number;
  deposit: number;
}
export const SAM: Fixture = { rate: '6.9', count: 60, cadence: { unit: 'month', every: 1 }, quoted: { kind: 'none' }, running: 39_000, deposit: 0 };

export function build(fx: Fixture = SAM) {
  const out = buildSchedule({
    asOf: '2026-10-03',
    financed: mu(2_700_000),
    apr: percent(fx.rate),
    cadence: fx.cadence,
    count: fx.count,
    firstPayment: { kind: 'one_period' },
    fees: { setup: mu(45_000), perPeriod: mu(0), end: mu(0) },
  });
  if (!out.ok) throw new Error('schedule');
  const card = planCard({ price: mu(2_700_000), tax: mu(189_000), oneOffFees: mu(10_000), schedule: out.schedule, runningMonthly: mu(fx.running) });
  const purchase = { schedule: out.schedule, runningMonthly: card.runningMonthly } as unknown as Purchase;
  return { purchase, card, quoted: fx.quoted };
}

