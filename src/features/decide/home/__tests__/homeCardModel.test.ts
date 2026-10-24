import type { DecideSettingsRow } from '@/db/decideSettings';
import type { SnapshotResult } from '../../snapshot/types';
import { array, assert as fcAssert, integer, property } from 'fast-check';
import { prepareContext, totalSetAside, type PotInput } from '@/engine/decide';
import { minorUnits } from '@/engine/money';
import { homeCardModel, type HomeCardFlags, type HomeCardModel } from '../homeCardModel';
import { TODAY, loggedSource, month, noneSource, roughSource, snapshot, unconvertedSource } from '../../snapshot/__tests__/helpers/snapshotFixtures';

const READY: HomeCardFlags = { status: 'ready', homeBasisSeen: true, today: TODAY };

function settings(over: Partial<DecideSettingsRow> = {}): DecideSettingsRow {
  return {
    user_id: 'u1',
    currency: 'USD',
    rough_income: null,
    rough_spending: null,
    reserve: null,
    dsr_line: null,
    housing_line: null,
    unsecured_multiple: null,
    investing_floor: null,
    saving_floor: null,
    basis_override: null,
    version: 1,
    updated_at: '2026-10-15T00:00:00Z',
    ...over,
  };
}

const months = (n: number, income = 500_000, spending = 300_000) =>
  ['2026-06', '2026-07', '2026-08', '2026-09'].slice(4 - n).map((m) => month(m, income, spending));

describe('homeCardModel', () => {
  it('D-97 the card label follows the engine basis', () => {
    // steady income, 4 full months: the engine's default for steady income is the average month
    const steady = homeCardModel(loggedSource({ months: months(4), basisOverride: 'average' }), settings(), READY);
    expect(steady).toMatchObject({ state: 'figure', label: 'average', info: null });

    const worst = homeCardModel(loggedSource({ months: months(4), basisOverride: 'worst' }), settings(), READY);
    expect(worst).toMatchObject({ state: 'figure', label: 'worst', info: null });

    // under 3 full months: the tightest figures, with the info term
    const tight = homeCardModel(loggedSource({ months: months(2) }), settings(), READY);
    expect(tight).toMatchObject({ state: 'figure', label: 'tightest', info: 'tightestFigures' });

    // rough figures: "Your figures"
    const rough = homeCardModel(roughSource(600_000, 400_000, 250_000), settings({ rough_income: 400_000, rough_spending: 250_000 }), READY);
    expect(rough).toMatchObject({ state: 'figure', label: 'figures', info: null, amount: 150_000, short: false, inAmount: 400_000, outAmount: 250_000 });
  });

  it('D-97 the figure is the engine left, in and out, as raw minor units', () => {
    const source = loggedSource({ months: months(4), basisOverride: 'worst' });
    if (source.kind !== 'logged') throw new Error('fixture');
    const ctx = prepareContext(source.snapshot);
    if (!ctx.ok) throw new Error('fixture');
    const model = homeCardModel(source, settings(), READY);
    if (model.state !== 'figure') throw new Error('expected a figure');
    expect(model.amount).toBe(Math.abs(ctx.context.leftBefore));
    expect(model.inAmount).toBe(ctx.context.money.incomeBasis);
    // D-100 addendum: Out is everything that leaves (spending plus the fixture's 200.00 debt payment), so In - Out is the hero
    expect(model.outAmount).toBe(ctx.context.money.spendingBasis + ctx.context.debtPayments);
    expect(Number.isInteger(model.amount)).toBe(true);
    expect(model.markBasisSeen).toBe(true);
  });

  it('D-97 a negative month reads short with the absolute amount', () => {
    const model = homeCardModel(roughSource(600_000, 320_000, 362_000), settings({ rough_income: 320_000, rough_spending: 362_000 }), READY);
    expect(model).toMatchObject({ state: 'figure', short: true, amount: 42_000, inAmount: 320_000, outAmount: 362_000 });

    const zero = homeCardModel(roughSource(600_000, 300_000, 300_000), settings(), READY);
    expect(zero).toMatchObject({ state: 'figure', short: false, amount: 0 });

    // logged: spending above income also reads short, never a minus
    const logged = homeCardModel(loggedSource({ months: months(4, 300_000, 400_000), basisOverride: 'worst' }), settings(), READY);
    if (logged.state !== 'figure') throw new Error('expected a figure');
    expect(logged.short).toBe(true);
    expect(logged.amount).toBeGreaterThan(0);
  });

  it('D-97 a missing rate makes the figure unavailable, never wrong', () => {
    const logged = homeCardModel(unconvertedSource('logged'), settings(), READY);
    expect(logged).toMatchObject({ state: 'unavailable', unavailable: { reason: 'missing_rate', currencies: ['EUR'], action: 'see_rate_lines' } });
    expect(logged).not.toHaveProperty('amount');

    const rough = homeCardModel(unconvertedSource('rough'), settings(), READY);
    expect(rough).toMatchObject({ state: 'unavailable', unavailable: { reason: 'missing_rate' } });

    // no rough figures and no month, with a rate missing: the rate is the reason shown
    expect(homeCardModel(unconvertedSource('none'), settings(), READY)).toMatchObject({ state: 'unavailable' });
  });

  it('D-97 a first run (no full month, no rough figures) asks for rough figures', () => {
    expect(homeCardModel(noneSource(), null, READY)).toEqual({
      state: 'first_run',
      label: 'figures',
      unavailable: { reason: 'first_run', action: 'add_rough' },
    });
  });

  it('D-97 a logged source with no usable month is unavailable with one action', () => {
    const source = loggedSource({ months: [{ ...month('2026-09', 500_000, 300_000), full: false }] });
    expect(homeCardModel(source, settings(), READY)).toMatchObject({ state: 'unavailable', unavailable: { reason: 'no_basis', action: 'add_rough' } });
  });

  it('D-97 loading, error and a missing source never show a figure', () => {
    expect(homeCardModel(null, null, { status: 'loading', homeBasisSeen: true, today: TODAY })).toEqual({ state: 'loading' });
    expect(homeCardModel(loggedSource(), null, { status: 'error', homeBasisSeen: true, today: TODAY })).toEqual({ state: 'error' });
    expect(homeCardModel(null, null, READY)).toEqual({ state: 'loading' });
  });

  it('D-95 the switch label shows only before homeBasisSeen', () => {
    const source = loggedSource({ months: months(4), basisOverride: 'worst' });
    const fromRough = settings({ rough_income: 400_000, rough_spending: 250_000 });

    const first = homeCardModel(source, fromRough, { status: 'ready', homeBasisSeen: false, today: TODAY });
    expect(first).toMatchObject({ state: 'figure', label: 'switched', markBasisSeen: true });

    const next = homeCardModel(source, fromRough, { status: 'ready', homeBasisSeen: true, today: TODAY });
    expect(next).toMatchObject({ state: 'figure', label: 'worst' });

    // a user who never gave rough figures has no basis to switch from
    expect(homeCardModel(source, settings(), { status: 'ready', homeBasisSeen: false, today: TODAY })).toMatchObject({ label: 'worst' });

    // rough figures never show the switch label
    expect(homeCardModel(roughSource(), fromRough, { status: 'ready', homeBasisSeen: false, today: TODAY })).toMatchObject({ label: 'figures', markBasisSeen: false });
  });

  it('D-95 the unavailable state keeps the basis label when a logged month exists', () => {
    const model = homeCardModel({ ...loggedSource({ months: months(4), basisOverride: 'worst' }), unconverted: { currencies: ['EUR', 'GBP'], rowCount: 3 } }, settings(), READY);
    expect(model).toMatchObject({ state: 'unavailable', label: 'worst', unavailable: { currencies: ['EUR', 'GBP'] } });
    expect(snapshot().months).toHaveLength(4);
  });

  describe('D-100 net free cash flow', () => {
    const signed = (m: HomeCardModel) => {
      if (m.state !== 'figure') throw new Error('expected a figure');
      return m.short ? -m.amount : m.amount;
    };
    const inOut = (m: HomeCardModel) => {
      if (m.state !== 'figure') throw new Error('expected a figure');
      return m.inAmount - m.outAmount;
    };
    const pot = (over: Partial<PotInput> = {}): PotInput => ({
      id: 'p1',
      kind: 'pot',
      target: minorUnits(120_000),
      monthlyAmount: null,
      readyBy: '2027-04-30',
      saved: minorUnits(0),
      ...over,
    });
    const POTS = [pot(), pot({ id: 'p2', target: minorUnits(60_000), saved: minorUnits(10_000), readyBy: '2027-01-31' })];
    const withPots = (source: SnapshotResult, pots: readonly PotInput[]): SnapshotResult =>
      source.kind === 'logged' ? { ...source, pots, snapshot: { ...source.snapshot, pots } } : { ...source, pots };

    it('D-100 In minus Out equals the hero on every basis and on rough figures', () => {
      const switched = settings({ rough_income: 400_000, rough_spending: 250_000 });
      const cases: [string, HomeCardModel][] = [
        ['worst', homeCardModel(withPots(loggedSource({ months: months(4), basisOverride: 'worst', monthlySaving: minorUnits(15_000) }), POTS), settings(), READY)],
        ['average', homeCardModel(withPots(loggedSource({ months: months(4), basisOverride: 'average', monthlyInvesting: minorUnits(9_000) }), POTS), settings(), READY)],
        ['tightest', homeCardModel(withPots(loggedSource({ months: months(2) }), POTS), settings(), READY)],
        ['switched', homeCardModel(withPots(loggedSource({ months: months(4), basisOverride: 'worst' }), POTS), switched, { ...READY, homeBasisSeen: false })],
        ['rough', homeCardModel(roughSource(600_000, 400_000, 250_000), settings(), READY)],
        ['rough with pots', homeCardModel(withPots(roughSource(600_000, 400_000, 250_000), POTS), settings(), READY)],
        ['short month', homeCardModel(withPots(roughSource(600_000, 320_000, 362_000), POTS), settings(), READY)],
      ];
      for (const [name, model] of cases) {
        expect([name, model.state]).toEqual([name, 'figure']);
        expect([name, inOut(model)]).toEqual([name, signed(model)]);
      }
      // the label still follows the basis the engine used
      expect(cases.map(([, m]) => (m.state === 'figure' ? m.label : null))).toEqual(['worst', 'average', 'tightest', 'switched', 'figures', 'figures', 'figures']);
    });

    it('D-100 In minus Out equals the hero for any logged figures, debts, saving and pots', () => {
      fcAssert(
        property(
          integer({ min: 0, max: 2_000_000 }),
          integer({ min: 0, max: 2_000_000 }),
          integer({ min: 0, max: 100_000 }),
          integer({ min: 0, max: 100_000 }),
          array(integer({ min: 1, max: 500_000 }), { maxLength: 4 }),
          (income, spending, saving, investing, targets) => {
            const pots = targets.map((target, i) => pot({ id: `p${i}`, target: minorUnits(target) }));
            const source = withPots(
              loggedSource({ months: months(4, income, spending), basisOverride: 'worst', monthlySaving: minorUnits(saving), monthlyInvesting: minorUnits(investing) }),
              pots
            );
            const m = homeCardModel(source, settings(), READY);
            if (m.state !== 'figure') return false;
            const b = m.breakdown;
            const rowsAddUp = b.income - b.spending - b.debts - b.saving - b.setAside === b.result;
            return rowsAddUp && inOut(m) === signed(m) && Number.isInteger(m.outAmount);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('D-100 rough figures take the pots set-asides off, like the logged formula', () => {
      const source = withPots(roughSource(600_000, 400_000, 250_000), POTS);
      const setAside = totalSetAside(POTS, TODAY).total;
      expect(setAside).toBeGreaterThan(0);
      const model = homeCardModel(source, settings(), READY);
      if (model.state !== 'figure') throw new Error('expected a figure');
      expect(signed(model)).toBe(400_000 - 250_000 - setAside);
      // Out is the rough spending plus the set-asides
      expect(model.outAmount).toBe(250_000 + setAside);
      expect(model.breakdown).toMatchObject({ source: 'rough', spending: 250_000, debts: 0, saving: 0, setAside });
      // the same pots in a logged month come off the same way
      const logged = homeCardModel(withPots(loggedSource({ months: months(4), basisOverride: 'worst' }), POTS), settings(), READY);
      const none = homeCardModel(loggedSource({ months: months(4), basisOverride: 'worst' }), settings(), READY);
      expect(signed(none) - signed(logged)).toBe(totalSetAside(POTS, TODAY).total);
    });

    it('D-100 the breakdown rows add up to the hero', () => {
      const m = homeCardModel(
        withPots(loggedSource({ months: months(4), basisOverride: 'worst', monthlySaving: minorUnits(15_000), monthlyInvesting: minorUnits(5_000) }), POTS),
        settings(),
        READY
      );
      if (m.state !== 'figure') throw new Error('expected a figure');
      const b = m.breakdown;
      expect(b.income - b.spending - b.debts - b.saving - b.setAside).toBe(b.result);
      expect(b).toMatchObject({ debts: 20_000, saving: 20_000 });
    });
  });
});
