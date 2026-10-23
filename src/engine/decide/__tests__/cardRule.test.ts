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
