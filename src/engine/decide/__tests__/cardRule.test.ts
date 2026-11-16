import { ITEM_TYPES, cardEligibility, suggestItemType, type ItemType } from '../cardRule';

describe('cardEligibility', () => {
  it.each<[ItemType, string]>([
    ['rent_bill', 'blocked'],
    ['loan_repayment', 'blocked'],
    ['insurance_premium', 'blocked'],
    ['vehicle', 'capped'],
    ['general', 'permitted'],
  ])('%s -> %s', (t, e) => {
    expect(cardEligibility(t, null)).toEqual({ eligibility: e, note: null });
  });

  it('property and cash_equivalent are blocked', () => {
    expect(cardEligibility('property', null)).toEqual({ eligibility: 'blocked', note: null });
    expect(cardEligibility('cash_equivalent', 'US')).toEqual({ eligibility: 'blocked', note: null });
  });

  it('tax is blocked in GB only (any case, trimmed) and otherwise permitted with a processor-fee note', () => {
    expect(cardEligibility('tax', 'GB')).toEqual({ eligibility: 'blocked', note: 'tax_gb' });
    expect(cardEligibility('tax', ' gb ')).toEqual({ eligibility: 'blocked', note: 'tax_gb' });
    expect(cardEligibility('tax', 'US')).toEqual({ eligibility: 'permitted', note: 'tax_processing_fee' });
    expect(cardEligibility('tax', null)).toEqual({ eligibility: 'permitted', note: 'tax_processing_fee' });
  });

  it('tuition is permitted with a fee note', () => {
    expect(cardEligibility('tuition', null)).toEqual({ eligibility: 'permitted', note: 'tuition_fee' });
  });

  it('covers every item type', () => {
    expect(ITEM_TYPES).toEqual([
      'vehicle',
      'rent_bill',
      'loan_repayment',
      'tax',
      'insurance_premium',
      'general',
      'property',
      'cash_equivalent',
      'tuition',
    ]);
  });

  it('throws for an invalid runtime value', () => {
    expect(() => cardEligibility('boat' as never, null)).toThrow('Unhandled itemType: "boat"');
  });
});

describe('suggestItemType', () => {
  it.each<[string, ItemType]>([
    ['Car note', 'loan_repayment'],
    ['Student loans', 'loan_repayment'],
    ['Mortgage payment', 'loan_repayment'],
    ['Instalments for sofa', 'loan_repayment'],
    ['Repayment', 'loan_repayment'],
    ['Rent', 'rent_bill'],
    ['Electricity bill', 'rent_bill'],
    ['Council tax', 'tax'],
    ['Taxes', 'tax'],
    ['Insurance premium', 'insurance_premium'],
    ['Premiums', 'insurance_premium'],
    ['Car', 'vehicle'],
    ['Used SUV', 'vehicle'],
    ['Motorbike', 'vehicle'],
    ['Van hire', 'vehicle'],
    ['Vehicles', 'vehicle'],
    ['Sofa', 'general'],
    ['Cardigan', 'general'],
    ['', 'general'],
    ['car-loan', 'loan_repayment'],
  ])('%j -> %s', (name, expected) => {
    expect(suggestItemType(name)).toBe(expected);
  });
});
