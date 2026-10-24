/**
 * D-92 (R16.8, R16.11 E5): card rules by item type and region, three new item types, phrase-only suggestions.
 *
 * Research sources behind the rules (research report of 2026-10-23):
 * - Fannie Mae Selling Guide B3-4.3-16: a down payment financed by a credit card is not an acceptable source of funds.
 * - HMRC has not taken personal credit cards for tax since January 2018 (GB).
 * - Experian and The Points Guy: wires, money orders, gift cards, crypto and gambling are treated as cash advances.
 */
import { minorUnits } from '../../../money/types';
import { cardEligibility, suggestItemType, type ItemType } from '../../cardRule';
import { resolvePlan } from '../../plan';
import type { BuyCheck } from '../../types';
import { USD } from '../helpers/fixtures';
import { RUNNING_COST_PROMPTS, runningCostPrompts } from '../../runningCostPrompts';

describe('D-92 card rules', () => {
  it('D-92 property and cash-like are never counted on a card', () => {
    for (const region of [null, 'GB', 'US', 'CA', 'DE']) {
      expect(cardEligibility('property', region)).toEqual({ eligibility: 'blocked', note: null });
      expect(cardEligibility('cash_equivalent', region)).toEqual({ eligibility: 'blocked', note: null });
    }
  });

  it('D-92 tax is blocked only in GB and carries the processing note elsewhere', () => {
    expect(cardEligibility('tax', 'GB')).toEqual({ eligibility: 'blocked', note: 'tax_gb' });
    expect(cardEligibility('tax', ' gb ')).toEqual({ eligibility: 'blocked', note: 'tax_gb' });
    for (const region of ['US', 'CA', 'DE', 'AU', '', null]) {
      expect(cardEligibility('tax', region)).toEqual({ eligibility: 'permitted', note: 'tax_processing_fee' });
    }
  });

  it('D-92 the card plan reads the region from the card payment', () => {
    const base = (itemType: ItemType, region?: string | null): BuyCheck => ({
      kind: 'buy',
      currency: USD,
      price: minorUnits(100_000),
      dayFees: minorUnits(0),
      itemType,
      runningCostsNet: minorUnits(0),
      payment: {
        method: 'card',
        card: { id: 'c1', apr: null, minimumTerms: null, currency: USD },
        payoff: { kind: 'full' },
        dealerCap: null,
        ...(region === undefined ? {} : { region }),
      },
    });
    expect(resolvePlan(base('tax', 'GB'))).toEqual({ status: 'missing', reasons: ['card_not_accepted'] });
    expect(resolvePlan(base('tax', 'US')).status).toBe('resolved');
    expect(resolvePlan(base('tax', null)).status).toBe('resolved');
    expect(resolvePlan(base('tax')).status).toBe('resolved');
    expect(resolvePlan(base('property', 'US'))).toEqual({ status: 'missing', reasons: ['card_not_accepted'] });
    expect(resolvePlan(base('tuition')).status).toBe('resolved');
  });

  it('D-92 tuition is permitted with a fee note', () => {
    expect(cardEligibility('tuition', null)).toEqual({ eligibility: 'permitted', note: 'tuition_fee' });
    expect(cardEligibility('tuition', 'GB')).toEqual({ eligibility: 'permitted', note: 'tuition_fee' });
  });

  it('D-92 the rest are as before and carry no note', () => {
    expect(cardEligibility('vehicle', 'GB')).toEqual({ eligibility: 'capped', note: null });
    expect(cardEligibility('general', 'GB')).toEqual({ eligibility: 'permitted', note: null });
    expect(cardEligibility('rent_bill', 'US').eligibility).toBe('blocked');
  });

  it.each<[string, ItemType]>([
    ['House deposit', 'property'],
    ['down payment', 'property'],
    ['Mortgage deposit', 'property'],
    ['buy a house', 'property'],
    ['Property', 'property'],
    ['Condo', 'property'],
    ['Apartment purchase', 'property'],
    ['Wire transfer', 'cash_equivalent'],
    ['Money orders', 'cash_equivalent'],
    ['Gift card', 'cash_equivalent'],
    ['Bitcoin', 'cash_equivalent'],
    ['Crypto', 'cash_equivalent'],
    ['Casino night', 'cash_equivalent'],
    ['Gambling', 'cash_equivalent'],
    ['Betting', 'cash_equivalent'],
    ['Tuition', 'tuition'],
    ['School fees', 'tuition'],
    ['Course fees', 'tuition'],
    ['College', 'tuition'],
    ['University', 'tuition'],
    ['Property tax', 'property'],
    ['car down payment', 'vehicle'],
  ])('D-92 suggestions match phrases only: %j -> %s', (name, expected) => {
    expect(suggestItemType(name)).toBe(expected);
  });

  it('D-92 suggestions match phrases only (the M5 negatives)', () => {
    const negatives: [string, ItemType][] = [
      ['home gym', 'general'],
      ['home printer', 'general'],
      ['flat screen tv', 'general'],
      ['car deposit', 'vehicle'],
      ['rental deposit', 'general'],
      ['wire fence', 'general'],
      ['lego land set', 'general'],
      ['board game bet', 'general'],
      ['shares', 'general'],
      ['stocks', 'general'],
    ];
    for (const [name, expected] of negatives) {
      const got = suggestItemType(name);
      expect(got).not.toBe('property');
      expect(got).not.toBe('cash_equivalent');
      expect(got).toBe(expected);
    }
  });

  it('D-92 the new types list their running costs', () => {
    expect(RUNNING_COST_PROMPTS.property).toEqual(['property_tax', 'home_insurance', 'maintenance', 'utilities', 'service_charge']);
    expect(RUNNING_COST_PROMPTS.tuition).toEqual(['books_materials', 'travel', 'accommodation']);
    expect(RUNNING_COST_PROMPTS.cash_equivalent).toEqual([]);
    expect(runningCostPrompts('property')).toBe(RUNNING_COST_PROMPTS.property);
    expect(runningCostPrompts('tuition')).toBe(RUNNING_COST_PROMPTS.tuition);
    expect(runningCostPrompts('cash_equivalent')).toBe(RUNNING_COST_PROMPTS.cash_equivalent);
  });
});
