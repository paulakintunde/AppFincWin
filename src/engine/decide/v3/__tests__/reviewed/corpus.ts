/**
 * 05.4-08 (D-14, ENG-28): the fixed corpus for the reviewed diff. Every invented person (golden and audit) at four cash
 * prices and one 48-month plan, plus 200 seeded generated histories. Deterministic: same keys and inputs on every run.
 * Test-only; everyone here is synthetic.
 */
import { evaluate } from '../../evaluate';
import type { CheckV2, V3Inputs } from '../../types';
import { loadPersons, toCheckV2, toV3Inputs, type FixturePerson, type FixturePurchase } from '../golden/adapter';
import auditFile from '../golden/audit-personas.json';
import { generateHistories } from '../shadow/generate';
import { pick } from '../rightAnswers/pick';

export interface CorpusCase {
  readonly key: string;
  readonly label: string;
  readonly inputs: V3Inputs;
  readonly check: CheckV2;
}
export interface ReviewedAnswer {
  readonly code: string;
  readonly variant: string | null;
  readonly afterBuyMonth: number | null;
}

export interface ReviewedChange {
  fixId: string;
  key: string;
  before: ReviewedAnswer;
  after: ReviewedAnswer;
  reason: string;
  approved: boolean;
  approvedAt: string | null;
}

const CASH_PRICES = [6000, 50000, 200000, 900000] as const;
const PLAN_PRICE = 900000;

const BASE: FixturePurchase = {
  price: null,
  taxPercent: null,
  oneOffFees: 0,
  itemType: 'general',
  purpose: null,
  emergency: false,
  envelopeId: null,
  categoryId: null,
  pay: { mode: 'once' },
  extras: {},
  share: 'personal',
  foreign: null,
};

function cash(price: number): FixturePurchase {
  return { ...BASE, price };
}
function plan(price: number): FixturePurchase {
  return {
    ...BASE,
    price,
    pay: {
      mode: 'plan',
      cadence: { unit: 'month', every: 1 },
      count: 48,
      termMonths: null,
      aprText: '7.9',
      fees: { setup: 0, perPeriod: 0, end: 0 },
      deposit: 0,
      tradeIn: 0,
      quotedPayment: null,
      firstPayment: { kind: 'one_period' },
      deferredInterestTerm: false,
    },
  };
}

export function corpus(): CorpusCase[] {
  const out: CorpusCase[] = [];
  const persons: FixturePerson[] = [...loadPersons(), ...(auditFile as unknown as { persons: FixturePerson[] }).persons];
  for (const person of persons) {
    const inputs = toV3Inputs(person);
    for (const price of CASH_PRICES) {
      out.push({ key: `persona:${person.id}:${price}:cash`, label: `${person.id}, ${price / 100} in cash`, inputs, check: toCheckV2(cash(price)) });
    }
    out.push({ key: `persona:${person.id}:${PLAN_PRICE}:plan`, label: `${person.id}, ${PLAN_PRICE / 100} over 48 months`, inputs, check: toCheckV2(plan(PLAN_PRICE)) });
  }
  generateHistories(200).forEach((g, i) => {
    const purchase = g.purchases[0];
    if (purchase === undefined) throw new RangeError(`corpus: generated history ${i} has no purchase`);
    out.push({ key: `gen:${i}`, label: `generated ${i} (${g.person.id})`, inputs: toV3Inputs(g.person), check: toCheckV2(purchase) });
  });
  return out;
}

export function answerOf(c: CorpusCase): ReviewedAnswer {
  const p = pick(evaluate(c.inputs, c.check));
  return { code: p.code, variant: p.variant, afterBuyMonth: p.afterBuy.month };
}

export function currentAnswers(): Record<string, ReviewedAnswer> {
  const out: Record<string, ReviewedAnswer> = {};
  for (const c of corpus()) out[c.key] = answerOf(c);
  return out;
}
