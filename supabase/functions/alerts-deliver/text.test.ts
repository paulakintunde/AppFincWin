// Runs under Deno (`npm run test:deno`) and under Jest (the default suite): no runner imports.
import { digestText, formatAmount, pushText } from './text.ts';

type Runner = (name: string, fn: () => void | Promise<void>) => void;
const g = globalThis as unknown as { Deno?: { test: Runner }; test?: Runner };
const run: Runner = (name, fn) => (g.Deno ? g.Deno.test(name, fn) : (g.test as Runner)(name, fn));

function assertEquals(actual: unknown, expected: unknown, msg = ''): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${msg} expected ${JSON.stringify(expected)} got ${JSON.stringify(actual)}`);
  }
}

run('partner alert says who, amount and category', () => {
  assertEquals(pushText('partner_large', { who: 'Sam', hidden: false, category: 'Home', amount_minor: 32000, currency: 'USD' }), 'Sam spent $320 on Home');
});

run('hidden names read A household member', () => {
  assertEquals(pushText('partner_large', { who: 'Sam', hidden: true, category: 'Home', amount_minor: 32000, currency: 'USD' }), 'A household member spent $320 on Home');
});

run('private category reads A household member spent, with no category (owner wording 2026-11-27)', () => {
  assertEquals(pushText('partner_large', { who: 'Sam', hidden: false, category: null, amount_minor: 32000, currency: 'USD' }), 'A household member spent $320.');
});

run('the other kinds match UI-SPEC 5c', () => {
  assertEquals(pushText('bills_due', { bill: 'Rent', amount_minor: 120000, currency: 'USD', lead_days: 1 }), 'Rent, $1,200, is due tomorrow.');
  assertEquals(pushText('bills_due', { bill: 'Rent', amount_minor: 120000, currency: 'USD', lead_days: 0 }), 'Rent, $1,200, is due today.');
  assertEquals(pushText('bills_due', { bill: 'Rent', amount_minor: 120000, currency: 'USD', lead_days: 3 }), 'Rent, $1,200, is due in 3 days.');
  assertEquals(pushText('over_cap', { category: 'Dining', over_minor: 2400, currency: 'USD' }), 'Dining is over its cap by $24 this month.');
  assertEquals(pushText('goal_reached', { goal: 'Holiday fund', amount_minor: 200000, currency: 'USD' }), 'Holiday fund has reached its $2,000 target.');
  assertEquals(pushText('large_txn', { category: 'Shopping', amount_minor: 48000, currency: 'USD' }), 'A $480 expense was added to Shopping.');
  assertEquals(pushText('low_balance', { account: 'Everyday account', amount_minor: 10000, currency: 'USD' }), 'Everyday account is below $100.');
});

run('minor part shows only when not zero; exponent follows the currency', () => {
  assertEquals(formatAmount(32050, 'USD'), '$320.50');
  assertEquals(formatAmount(500, 'JPY'), '¥500');
  assertEquals(formatAmount(1234, 'USD'), '$12.34');
});

run('unexpected params never appear in the text', () => {
  const t = pushText('partner_large', { who: 'Sam', hidden: false, category: 'Home', amount_minor: 32000, currency: 'USD', note: 'SECRET-NOTE', payee: 'SECRET-PAYEE' });
  assertEquals(t.includes('SECRET'), false);
  assertEquals(t, 'Sam spent $320 on Home');
});

run('digest text lists counts in a fixed order', () => {
  assertEquals(digestText({ over_cap: 1, bills_due: 2 }), 'Today: 2 bills due, 1 category over its cap.');
  assertEquals(digestText({ bills_due: 1 }), 'Today: 1 bill due.');
});
