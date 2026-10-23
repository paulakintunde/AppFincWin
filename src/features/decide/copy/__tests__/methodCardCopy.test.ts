import en from '@/i18n/locales/en';
import type { Plan, PlanReason } from '@/engine/decide';
import { emptyCheckInputs } from '../../snapshot/checkInputs';
import type { CheckInputs, MethodKey } from '../../snapshot/types';
import { joinPreview } from '../foldCopy';
import { needsFields, needsText, methodSummary, type NeedsField } from '../methodCardCopy';
import type { CopyRef } from '../types';
import { resolvesInEn } from './helpers/enKeys';

const node = (path: string): string | undefined => {
  const v = path.split('.').reduce<unknown>((n, p) => (n && typeof n === 'object' ? (n as Record<string, unknown>)[p] : undefined), en);
  return typeof v === 'string' ? v : undefined;
};
function t(key: string, params: Record<string, string | number> = {}): string {
  const count = params.count;
  const raw = (typeof count === 'number' ? node(`${key}_${count === 1 ? 'one' : 'other'}`) : undefined) ?? node(key);
  if (raw === undefined) throw new Error(`missing ${key}`);
  return raw.replace(/\{\{(\w+)\}\}/g, (_m, name: string) => String(params[name]));
}

const base = (over: Partial<CheckInputs> = {}): CheckInputs => ({ ...emptyCheckInputs('buy', '2026-10-01'), advertised: 150_000, ...over });
const whole = (n: number) => `$${Math.round(n / 100).toLocaleString('en-US')}`;
const exact = (n: number) => `$${(n / 100).toFixed(2)}`;
const fields = (method: MethodKey, reasons: PlanReason[], inputs = base()) => needsFields(method, reasons, inputs)?.fields ?? null;
const plan = { dayOne: 150_000, monthly: 5_000 } as unknown as Plan;
const cards = [{ accountId: 'c1', name: 'Visa' }] as never;
const summary = (method: MethodKey, inputs: CheckInputs, p: Plan | null = null) => {
  const s = methodSummary({ method, inputs, plan: p, cash: 1_200_000, whole, exact, cards });
  if (s === null) return null;
  return joinPreview(t, s as CopyRef | readonly CopyRef[]).replace(/ /g, ' '); // the plurals hold a no-break space
};

describe('methodCardCopy', () => {
  it('D-79 Needs lists the R15.2 fields per method', () => {
    expect(fields('cash', [], base({ advertised: 0 }))).toEqual(['price']);
    expect(fields('cash', [])).toBeNull();
    expect(fields('loan', ['loan_term_missing', 'loan_apr_missing'])).toEqual(['rate', 'months']);
    expect(fields('instalment', ['instalment_count_missing', 'instalment_amount_missing'])).toEqual(['payment', 'howMany']);
    const withRate = base({ instalment: { amount: null, count: null, lateFee: null, hasRate: true, aprText: '', firstPayment: 'today' } });
    expect(fields('instalment', ['instalment_rate_missing', 'instalment_count_missing'], withRate)).toEqual(['howMany', 'rate']);
    expect(fields('card', ['dealer_cap_missing', 'card_minimum_terms_missing', 'card_apr_missing'])).toEqual(['cardRate', 'minimumTerms', 'dealerCap']);
    expect(fields('lump', [], base({ advertised: null }))).toEqual(['amount']);
    expect(fields('monthly', ['invest_term_missing'], base({ advertised: null }))).toEqual(['amount', 'months']);
    const all: NeedsField[] = ['price', 'rate', 'months', 'payment', 'howMany', 'cardRate', 'minimumTerms', 'dealerCap', 'usdRate', 'amount'];
    expect(all.every((f) => resolvesInEn(`decide.pay.card.field.${f}`))).toBe(true);
    const needs = needsFields('loan', ['loan_apr_missing', 'loan_term_missing'], base());
    expect(needs).not.toBeNull();
    expect(needsText(t, needs!)).toEqual({ line: 'Needs: rate, months', fields: 'rate, months' });
  });

  it('D-91 Needs reads USD rate', () => {
    const needs = needsFields('card', ['card_limit_rate_missing'], base());
    expect(needs?.fields).toEqual(['usdRate']);
    expect(needs?.edit).toBe(false);
    expect(needsText(t, needs!)).toEqual({ line: 'Needs: USD rate', fields: 'USD rate' });
  });

  it('D-79 Needs price and amount offer Edit, other fields do not', () => {
    expect(needsFields('cash', [], base({ advertised: 0 }))?.edit).toBe(true);
    expect(needsFields('lump', [], base({ advertised: null }))?.edit).toBe(true);
    expect(needsFields('loan', ['loan_apr_missing'], base())?.edit).toBe(false);
  });

  it('D-79 folded summaries leave missing parts out', () => {
    const loan = (over: Partial<CheckInputs['loan']>) => base({ loan: { ...base().loan, deposit: 200_000, ...over } });
    expect(summary('loan', loan({ termMonths: 36, aprText: '6.5' }))).toBe('$2,000 down · 36 months · 6.5%');
    expect(summary('loan', loan({ termMonths: 36, aprText: '' }))).toBe('$2,000 down · 36 months');
    expect(summary('loan', loan({ termMonths: null, aprText: '' }))).toBe('$2,000 down');
    expect(summary('loan', loan({ termMonths: 1, aprText: '0' }))).toBe('$2,000 down · 1 month · 0%');
    expect(summary('cash', base(), plan)).toBe('$1,500 on the day · leaves $10,500');
    expect(summary('cash', base())).toBeNull();
    const inst = (over: Partial<NonNullable<CheckInputs['instalment']>>) =>
      base({ instalment: { amount: 5_000, count: 12, lateFee: null, hasRate: false, aprText: '', firstPayment: 'today', ...over } });
    // D-89 (R16.16 M6): the summary names the frequency; the full table is in instalmentCopy.test.ts
    expect(summary('instalment', inst({}))).toBe('12 × $50.00 a month · no rate');
    expect(summary('instalment', inst({ hasRate: true, aprText: '9' }))).toBe('12 × $50.00 a month · 9%');
    expect(summary('instalment', inst({ freq: 'weekly' }))).toBe('12 × $50.00 weekly · no rate');
    expect(summary('instalment', inst({ firstPayment: 'next_month' }))).toBe('12 × $50.00 a month · no rate · first in a month');
    expect(summary('instalment', inst({ count: null }))).toBeNull();
    const card = (over: Partial<CheckInputs['card']>) => base({ card: { ...base().card, accountId: 'c1', ...over } });
    expect(summary('card', card({ payoff: 'full' }))).toBe('Visa · in full next statement');
    expect(summary('card', card({ payoff: 'months', months: 6 }))).toBe('Visa · over 6 months');
    expect(summary('card', card({ payoff: 'minimum' }))).toBe('Visa · minimum only');
    expect(summary('card', card({ accountId: null }))).toBeNull();
    expect(summary('lump', base({ kind: 'invest', advertised: 100_000 }))).toBe('$1,000 once');
    expect(summary('lump', base({ kind: 'invest', advertised: 100_000, investReturnText: '5' }))).toBe('$1,000 once · 5% a year');
    expect(summary('monthly', base({ kind: 'invest', advertised: 20_000, investTermMonths: 24 }))).toBe('$200.00 a month · 24 months');
    expect(summary('monthly', base({ kind: 'invest', advertised: 20_000, investTermMonths: null }))).toBeNull();
  });
});
