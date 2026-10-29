import { demoSource } from '../../../__tests__/helpers/demoScenario';
import { buildDecideSnapshot, type SnapshotSource } from '../../buildSnapshot';
import { buildV3Inputs } from '../buildV3Inputs';
import { v3s } from './v3Fixtures';

const TODAY = '2026-10-03';

// CR-03 read side: a settings money figure typed in another currency never reaches the engine as home money.
describe('buildV3Inputs: settings money is read only in the home currency', () => {
  const base = demoSource(TODAY); // home USD
  const withCurrency = (currency: string | null, over: Partial<NonNullable<SnapshotSource['settings']>> = {}): SnapshotSource => ({
    ...base,
    settings: { ...base.settings!, currency, ...over },
  });
  const money = v3s({
    everyday_override: 200000,
    unspent_anchor: 50000,
    unspent_anchor_at: '2026-10-01',
    steady_amount: 300000,
    unexplained_amount: 10000,
    unexplained_at: '2026-10-02',
    unexplained_use: 'spare',
    income_types: ['salary_or_wages'],
    hold_months: 2,
  });

  it('currency differs from home: every settings money figure is dropped, non-money answers still flow', () => {
    const i = buildV3Inputs(withCurrency('GBP', { reserve: 500000 }), money);
    expect(i.everydayOverride).toBeNull();
    expect(i.unspent).toBeNull();
    expect(i.profile?.steady).toBeNull();
    expect(i.unexplainedAnswer).toBeNull();
    expect(i.emergency).toBeNull();
    expect(i.profile?.types).toEqual(['salary']);
    expect(i.profile?.billsHorizonMonths).toBe(2);
  });

  it('currency differs and nothing else is set up: still no figure', () => {
    const i = buildV3Inputs(withCurrency('GBP'), null);
    expect(i.everydayOverride).toBeNull();
    expect(i.profile).toBeNull();
  });

  it('currency equals home: every figure flows', () => {
    const i = buildV3Inputs(withCurrency('USD', { reserve: 500000 }), money);
    expect(i.everydayOverride).toBe(200000);
    expect(i.unspent).toEqual({ amount: 50000, at: '2026-10-01' });
    expect(i.profile?.steady).toBe(300000);
    expect(i.unexplainedAnswer).not.toBeNull();
    expect(i.emergency).toEqual({ amount: 500000, accountId: null });
  });

  it('null currency (rows written before the fix) reads as home', () => {
    const i = buildV3Inputs(withCurrency(null), money);
    expect(i.everydayOverride).toBe(200000);
    expect(i.profile?.steady).toBe(300000);
  });

  it('no settings row at all: v3 figures still flow (nothing to compare against)', () => {
    const i = buildV3Inputs({ ...base, settings: null }, money);
    expect(i.everydayOverride).toBe(200000);
  });

  describe('rough branch', () => {
    const rough = (currency: string | null): SnapshotSource => ({
      ...base,
      rates: [
        { quote: 'USD', rate: '1.1', rate_date: '2026-10-02', source: 'frankfurter-v2' },
        { quote: 'GBP', rate: '0.85', rate_date: '2026-10-02', source: 'frankfurter-v2' },
      ],
      rows: [],
      series: [],
      debts: [],
      settings: { ...base.settings!, currency, rough_income: 400000, rough_spending: 250000 },
    });
    const roughV3 = v3s({ rough_saving: 1000, rough_debt: 2000, rough_invest: 3000, rough_as_of: '2026-09-15' });

    it('stored currency differs from home: rough income, spending, saving, debt and invest are all dropped', () => {
      const src = rough('GBP');
      expect(buildDecideSnapshot(src).kind).toBe('rough');
      expect(buildV3Inputs(src, roughV3).rough).toBeNull();
    });

    it('stored currency equals home or is null: the figures flow', () => {
      const filled = { income: 400000, expenses: 250000, saving: 1000, debt: 2000, invest: 3000, asOf: '2026-09-15' };
      expect(buildV3Inputs(rough('USD'), roughV3).rough).toEqual(filled);
      expect(buildV3Inputs(rough(null), roughV3).rough).toEqual(filled);
    });
  });
});
