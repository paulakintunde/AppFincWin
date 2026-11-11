import { prefillRunningCosts, RUNNING_COST_TEMPLATES, templateRegionOf, type PrefillBill } from '../runningCostTemplates';

const base = { kind: 'car', country: 'US', currency: 'USD', bills: [] as PrefillBill[], start: '2026-11-11' };
const bill = (over: Partial<PrefillBill>): PrefillBill => ({ id: 'b1', name: 'Car insurance', categoryName: 'Insurance', amount: 9000, everyMonths: 1, ...over });

describe('prefillRunningCosts', () => {
  it('uses the dated US table for a car with no bills', () => {
    const out = prefillRunningCosts(base);
    expect(RUNNING_COST_TEMPLATES.asOf).toBe('2026-11');
    expect(out.map((o) => [o.key, o.line.amount, o.line.everyMonths, o.line.on, o.source])).toEqual([
      ['insurance', 14000, 1, true, 'quick_estimate'],
      ['fuel', 12000, 1, true, 'quick_estimate'],
      ['maintenance', 60000, 12, true, 'quick_estimate'],
      ['registration', 15600, 12, true, 'quick_estimate'],
      ['value_loss', 0, 12, false, 'quick_estimate'],
    ]);
    expect(out.every((o) => !o.draft && o.line.start === '2026-11-11' && o.line.end === null)).toBe(true);
  });

  it('marks the other country tables as drafts', () => {
    for (const [country, currency] of [['GB', 'GBP'], ['CA', 'CAD'], ['DE', 'EUR']] as const) {
      const out = prefillRunningCosts({ ...base, country, currency });
      expect(out[0]?.draft).toBe(true);
      expect(out[0]?.line.amount).toBeGreaterThan(0);
    }
  });

  it('takes a matching recorded bill first, with its own amount and how often', () => {
    const out = prefillRunningCosts({ ...base, bills: [bill({ amount: 8000, everyMonths: 3 })] });
    expect(out[0]).toMatchObject({ key: 'insurance', source: 'records', billId: 'b1', draft: false });
    expect(out[0]?.line).toMatchObject({ amount: 8000, everyMonths: 3, on: true });
    expect(out[1]?.source).toBe('quick_estimate');
  });

  it('does not fill the car line from a home insurance bill or an odd cadence', () => {
    expect(prefillRunningCosts({ ...base, bills: [bill({ name: 'Home insurance' })] })[0]?.source).toBe('quick_estimate');
    expect(prefillRunningCosts({ ...base, bills: [bill({ everyMonths: null })] })[0]?.source).toBe('quick_estimate');
    expect(prefillRunningCosts({ ...base, bills: [bill({ amount: 0 })] })[0]?.source).toBe('quick_estimate');
  });

  it('matches fuel and ignores a bill in another category', () => {
    const fuel = bill({ id: 'f', name: 'Fuel card', categoryName: 'Transport', amount: 11000 });
    expect(prefillRunningCosts({ ...base, bills: [fuel] })[1]).toMatchObject({ key: 'fuel', source: 'records', billId: 'f' });
    const wrong = bill({ id: 'g', name: 'Fuel card', categoryName: 'Groceries' });
    expect(prefillRunningCosts({ ...base, bills: [wrong] })[1]?.source).toBe('quick_estimate');
    const uncategorised = bill({ id: 'h', name: 'Petrol', categoryName: null });
    expect(prefillRunningCosts({ ...base, bills: [uncategorised] })[1]?.billId).toBe('h');
    expect(prefillRunningCosts({ ...base, bills: [bill({ name: 'Service plan', categoryName: 'Transport' })] })[2]?.source).toBe('records');
  });

  it('gives zero, switched-off lines when the country or currency has no table', () => {
    for (const input of [{ ...base, country: 'JP', currency: 'JPY' }, { ...base, country: null }, { ...base, country: 'GB', currency: 'USD' }]) {
      const out = prefillRunningCosts(input);
      expect(out).toHaveLength(5);
      expect(out.every((o) => o.line.amount === 0 && !o.line.on && !o.draft)).toBe(true);
    }
  });

  it('still lets a recorded bill fill a line where no table exists', () => {
    const out = prefillRunningCosts({ ...base, country: 'JP', currency: 'JPY', bills: [bill({})] });
    expect(out[0]).toMatchObject({ source: 'records' });
  });

  it('returns nothing for other kinds, and never for home', () => {
    for (const kind of ['tech', 'everyday', 'home', 'other', null]) expect(prefillRunningCosts({ ...base, kind })).toEqual([]);
  });
});

describe('templateRegionOf', () => {
  it('maps countries to table regions', () => {
    expect(templateRegionOf('US')).toBe('US');
    expect(templateRegionOf('FR')).toBe('EU');
    expect(templateRegionOf('JP')).toBeNull();
    expect(templateRegionOf(null)).toBeNull();
  });
});
