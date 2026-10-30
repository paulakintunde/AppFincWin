import { costFields, majorAssetFields } from '../costFields';

jest.setTimeout(60000);

describe('costFields', () => {
  it('M-08: vehicle lists its preset questions in order without sales_tax', () => {
    const f = costFields('vehicle');
    expect(f.map((x) => x.id)).toEqual(['insurance_monthly', 'fuel_monthly', 'maintenance_yearly', 'registration_yearly', 'loss_of_value', 'dealer_fees', 'trade_in']);
    expect(f.find((x) => x.id === 'trade_in')).toEqual({ id: 'trade_in', role: 'credit', answer: 'amount', cadence: 'one_off' });
    expect(f[0]).toEqual({ id: 'insurance_monthly', role: 'cost', answer: 'amount', cadence: 'monthly' });
  });
  it('M-08: property lists no deposit', () => {
    const ids = costFields('property').map((x) => x.id);
    expect(ids).not.toContain('deposit');
    expect(ids).toContain('closing_costs');
    expect(costFields('property').find((x) => x.id === 'rent_stops')?.answer).toBe('yes_no');
  });
  it('lists general and an empty type', () => {
    expect(costFields('general').map((x) => x.id)).toEqual(['insurance_monthly', 'maintenance_yearly', 'loss_of_value']);
    expect(costFields('rent_bill')).toEqual([]);
    expect(costFields('tax').find((x) => x.id === 'due_date')?.answer).toBe('date');
  });
});

describe('majorAssetFields', () => {
  it('D-18: property already asks closing and moving costs, so both L6 fields hide', () => {
    expect(majorAssetFields('property')).toEqual({ legal: false, moving: false });
  });
  it('D-18: vehicle needs both', () => {
    expect(majorAssetFields('vehicle')).toEqual({ legal: true, moving: true });
  });
});
