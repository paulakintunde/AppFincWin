// Defensive guards in buildPurchase that its own earlier checks make unreachable through normal input:
//  - buildSchedule can only answer ok:false for a missing count or first payment, and buildPurchase has already
//    returned those as missing codes before it asks for a schedule;
//  - a preset item type's question ids all exist in the library, so questionSpec never answers null for them.
// Each guard still has a defined, safe behaviour; these tests pin it by making the callee disagree.
import { minorUnits as mu } from '../../../../money/types';
import { percent } from '../../../../payoff/types';
import { ASOF, checkPlan, inputsOf } from '../../__tests__/helpers/fixtures';
import { buildPurchase } from '../purchase';

const mockState = { scheduleFails: false, nullSpecs: false, shortLastPaying: false };

jest.mock('../../plan/schedule', () => {
  const actual = jest.requireActual('../../plan/schedule');
  return {
    ...actual,
    buildSchedule: (i: unknown) => {
      if (mockState.scheduleFails) return { ok: false, missing: 'plan_count_missing' };
      const out = actual.buildSchedule(i);
      return mockState.shortLastPaying && out.ok ? { ok: true, schedule: { ...out.schedule, lastPaying: 1 } } : out;
    },
  };
});

jest.mock('../presetQuestions', () => {
  const actual = jest.requireActual('../presetQuestions');
  return {
    ...actual,
    questionSpec: (id: string) => (mockState.nullSpecs ? null : actual.questionSpec(id)),
  };
});

const inputs = inputsOf();
const ctx = { asOf: ASOF, thresholds: inputs.thresholds, custom: inputs.custom };
const plan = checkPlan(120000, { count: 12, apr: percent('0'), firstPayment: { kind: 'today' } });

afterEach(() => {
  mockState.scheduleFails = false;
  mockState.nullSpecs = false;
  mockState.shortLastPaying = false;
});

describe('buildPurchase defensive guards', () => {
  it('a schedule that cannot be built reports its missing code and no purchase', () => {
    mockState.scheduleFails = true;
    const b = buildPurchase(plan, ctx);
    expect(b.purchase).toBeNull();
    expect(b.missing).toEqual(['plan_count_missing']);
  });

  it('a question id with no library spec is skipped, nothing invented', () => {
    mockState.nullSpecs = true;
    const b = buildPurchase(
      { ...plan, itemType: { kind: 'preset', value: 'vehicle' }, extras: { insurance_monthly: mu(10000) } },
      ctx
    );
    expect(b.purchase?.runningMonthly).toBe(0);
  });

  it('a quoted total below the financed amount shows no negative interest', () => {
    mockState.shortLastPaying = true;
    const quoteOnly = checkPlan(204000, { count: 24, apr: null, firstPayment: { kind: 'one_period' }, quotedPayment: mu(9000) });
    const b = buildPurchase(quoteOnly, ctx);
    expect(b.purchase?.schedule?.totalInterest).toBe(0);
    expect(b.purchase?.schedule?.source).toBe('from_quote');
  });
});
