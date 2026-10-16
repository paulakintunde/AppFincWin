import { currencyCode, minorUnits } from '../../money/types';
import { ZERO_PERCENT } from '../../payoff';
import { firstRead } from '../firstRead';
import type { BuyCheck, FirstRead, InvestCheck, RoughFigures } from '../types';
import { USD, buyCash } from './helpers/fixtures';

const m = minorUnits;
const ROUGH = { level: 'rough', reasons: ['first_read'] };

function figures(over: Partial<{ cash: number; monthlyIncome: number; monthlySpending: number }> = {}): RoughFigures {
  return {
    currency: USD,
    cash: m(over.cash ?? 2_000_000),
    monthlyIncome: m(over.monthlyIncome ?? 420_000),
    monthlySpending: m(over.monthlySpending ?? 350_000),
  };
}

function loan(price: number, months: number | null, over: Partial<BuyCheck> = {}): BuyCheck {
  return buyCash(price, { payment: { method: 'loan', deposit: m(0), termMonths: months, apr: ZERO_PERCENT }, ...over });
}

function invest(amount: number, termMonths: number | null): InvestCheck {
  return { kind: 'invest', currency: USD, amount: m(amount), payment: { method: 'monthly', termMonths } };
}

function resolved(r: FirstRead): Extract<FirstRead, { plan: unknown }> {
  if (r.state === 'missing') throw new Error('expected a resolved first read');
  return r;
}

describe('firstRead (DEC-16)', () => {
  it('cash purchase that leaves the cushion intact fits', () => {
    const r = resolved(firstRead(figures(), buyCash(180_000)));
    expect(r).toMatchObject({
      state: 'fits',
      basisMarker: 'first_read_rough_figures',
      dayOne: 180_000,
      monthly: 0,
      cashAfter: 1_820_000,
      leftAfter: 70_000,
      roughCushion: 1_050_000,
      cashCovers: true,
      monthCloses: true,
      aboveCushion: true,
      warnings: [],
    });
    expect(r.confidence).toEqual(ROUGH);
  });

  it('cash left at or above 0 but below the rough cushion is adjust with a cash warning', () => {
    const r = resolved(firstRead(figures({ cash: 300_000 }), buyCash(180_000)));
    expect(r.state).toBe('adjust');
    expect(r.cashAfter).toBe(120_000);
    expect(r.aboveCushion).toBe(false);
    expect(r.warnings).toEqual([{ code: 'cash', shortfall: 930_000 }]);
    expect(r.confidence).toEqual(ROUGH);
  });

  it('cash after exactly the cushion fits (below means strictly less)', () => {
    expect(firstRead(figures({ cash: 1_230_000 }), buyCash(180_000)).state).toBe('fits');
  });

  it('cash that does not cover the day-one cost is no, with the gap to the cushion', () => {
    const r = resolved(firstRead(figures({ cash: 150_000 }), buyCash(180_000)));
    expect(r.state).toBe('no');
    expect(r.cashCovers).toBe(false);
    expect(r.warnings).toEqual([{ code: 'cash', shortfall: 1_080_000 }]);
  });

  it('cash after exactly 0 covers the cost but is below the cushion: adjust', () => {
    const r = resolved(firstRead(figures({ cash: 180_000 }), buyCash(180_000)));
    expect(r.cashCovers).toBe(true);
    expect(r.state).toBe('adjust');
  });

  it('zero rough spending means a zero cushion', () => {
    const r = resolved(firstRead(figures({ cash: 180_000, monthlySpending: 0 }), buyCash(180_000)));
    expect(r.roughCushion).toBe(0);
    expect(r.aboveCushion).toBe(true);
    expect(r.state).toBe('fits');
  });

  it('a monthly payment that leaves the month short is no with a month warning', () => {
    const r = resolved(firstRead(figures(), loan(1_800_000, 24)));
    expect(r).toMatchObject({ state: 'no', monthly: 75_000, leftAfter: -5_000, cashCovers: true, monthCloses: false });
    expect(r.warnings).toEqual([{ code: 'month', shortfall: 5_000 }]);
  });

  it('warnings are ordered by shortfall, largest first', () => {
    const r = resolved(firstRead(figures({ cash: 300_000 }), loan(1_800_000, 24)));
    expect(r.warnings).toEqual([
      { code: 'cash', shortfall: 750_000 },
      { code: 'month', shortfall: 5_000 },
    ]);
  });

  it('equal shortfalls put month first (WARNING_ORDER), whichever way they were pushed', () => {
    const r = resolved(firstRead(figures({ cash: 1_045_000 }), loan(1_800_000, 24)));
    expect(r.warnings).toEqual([
      { code: 'month', shortfall: 5_000 },
      { code: 'cash', shortfall: 5_000 },
    ]);
  });

  it('onboarding first check with credit and extras: 12 months at 0% with day fees', () => {
    const r = resolved(firstRead(figures(), loan(1_545_000, 12, { dayFees: m(95_000) })));
    expect(r).toMatchObject({ dayOne: 95_000, monthly: 120_833, cashAfter: 1_905_000, leftAfter: -50_833, state: 'no' });
    expect(r.plan.months).toBe(12);
    expect(r.warnings).toEqual([{ code: 'month', shortfall: 50_833 }]);
    expect(r.size).toBe('needs_spreading');
  });

  it('running costs count toward the month', () => {
    const r = resolved(firstRead(figures(), buyCash(180_000, { runningCostsNet: m(70_001) })));
    expect(r.leftAfter).toBe(-1);
    expect(r.state).toBe('no');
  });

  it('a monthly investment fits when the month closes', () => {
    const r = resolved(firstRead(figures(), invest(50_000, 12)));
    expect(r).toMatchObject({ state: 'fits', monthly: 50_000, leftAfter: 20_000 });
  });

  it('a loan with no term is missing, with the reason code', () => {
    const r = firstRead(figures(), loan(1_800_000, null));
    expect(r).toEqual({
      state: 'missing',
      basisMarker: 'first_read_rough_figures',
      reasons: ['loan_term_missing'],
      size: 'needs_spreading',
      confidence: ROUGH,
    });
  });

  describe('purchase size', () => {
    const size = (check: BuyCheck | InvestCheck, f = figures()): string => firstRead(f, check).size;
    it('spare this month when the price is at most the rough leftover', () => {
      expect(size(buyCash(70_000))).toBe('from_spare_this_month');
    });
    it('savings when cash after stays at or above the cushion', () => {
      expect(size(buyCash(180_000))).toBe('from_savings');
      expect(size(buyCash(950_000))).toBe('from_savings');
    });
    it('needs spreading beyond that', () => {
      expect(size(buyCash(950_001))).toBe('needs_spreading');
      expect(size(buyCash(180_000), figures({ cash: 300_000 }))).toBe('needs_spreading');
    });
    it('ignores the payment method', () => {
      expect(size(loan(1_800_000, 24))).toBe('needs_spreading');
      expect(size(invest(50_000, 12))).toBe('from_spare_this_month');
    });
    it('negative rough leftover is never from spare', () => {
      expect(size(buyCash(0), figures({ monthlyIncome: 100_000 }))).toBe('from_savings');
    });
  });

  it('is cash-level only', () => {
    const r = firstRead(figures({ cash: 300_000 }), loan(1_800_000, 24));
    const keys = Object.keys(r);
    for (const k of ['money', 'limits', 'steadiness', 'dsr', 'facts', 'pauseNeeded']) expect(keys).not.toContain(k);
    for (const w of resolved(r).warnings) expect(['month', 'cash']).toContain(w.code);
  });

  it('every state carries rough first_read confidence', () => {
    for (const r of [
      firstRead(figures(), buyCash(180_000)),
      firstRead(figures({ cash: 300_000 }), buyCash(180_000)),
      firstRead(figures({ cash: 150_000 }), buyCash(180_000)),
      firstRead(figures(), loan(1_800_000, null)),
    ]) {
      expect(r.confidence).toEqual({ level: 'rough', reasons: ['first_read'] });
    }
  });

  describe('guards', () => {
    it('rejects negative income or spending', () => {
      expect(() => firstRead(figures({ monthlyIncome: -1 }), buyCash(1))).toThrow(/^firstRead: /);
      expect(() => firstRead(figures({ monthlySpending: -1 }), buyCash(1))).toThrow(/^firstRead: /);
    });
    it('rejects non-integer cash', () => {
      expect(() => firstRead(figures({ cash: 1.5 }), buyCash(1))).toThrow(/^firstRead: /);
    });
    it('allows an overdrawn account', () => {
      expect(firstRead(figures({ cash: -100 }), buyCash(1)).state).toBe('no');
    });
    it('rejects mixed currencies', () => {
      const f: RoughFigures = { ...figures(), currency: currencyCode('CAD') };
      expect(() => firstRead(f, buyCash(1))).toThrow(/^firstRead: mixed currencies/);
    });
  });
});
