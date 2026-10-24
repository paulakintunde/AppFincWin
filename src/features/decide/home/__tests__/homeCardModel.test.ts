import type { DecideSettingsRow } from '@/db/decideSettings';
import { prepareContext } from '@/engine/decide';
import { homeCardModel, type HomeCardFlags } from '../homeCardModel';
import { loggedSource, month, noneSource, roughSource, snapshot, unconvertedSource } from '../../snapshot/__tests__/helpers/snapshotFixtures';

const READY: HomeCardFlags = { status: 'ready', homeBasisSeen: true };

function settings(over: Partial<DecideSettingsRow> = {}): DecideSettingsRow {
  return {
    user_id: 'u1',
    currency: 'USD',
    rough_income: null,
    rough_spending: null,
    reserve: null,
    dsr_line: null,
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
    expect(model.outAmount).toBe(ctx.context.money.spendingBasis);
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
    expect(homeCardModel(null, null, { status: 'loading', homeBasisSeen: true })).toEqual({ state: 'loading' });
    expect(homeCardModel(loggedSource(), null, { status: 'error', homeBasisSeen: true })).toEqual({ state: 'error' });
    expect(homeCardModel(null, null, READY)).toEqual({ state: 'loading' });
  });

  it('D-95 the switch label shows only before homeBasisSeen', () => {
    const source = loggedSource({ months: months(4), basisOverride: 'worst' });
    const fromRough = settings({ rough_income: 400_000, rough_spending: 250_000 });

    const first = homeCardModel(source, fromRough, { status: 'ready', homeBasisSeen: false });
    expect(first).toMatchObject({ state: 'figure', label: 'switched', markBasisSeen: true });

    const next = homeCardModel(source, fromRough, { status: 'ready', homeBasisSeen: true });
    expect(next).toMatchObject({ state: 'figure', label: 'worst' });

    // a user who never gave rough figures has no basis to switch from
    expect(homeCardModel(source, settings(), { status: 'ready', homeBasisSeen: false })).toMatchObject({ label: 'worst' });

    // rough figures never show the switch label
    expect(homeCardModel(roughSource(), fromRough, { status: 'ready', homeBasisSeen: false })).toMatchObject({ label: 'figures', markBasisSeen: false });
  });

  it('D-95 the unavailable state keeps the basis label when a logged month exists', () => {
    const model = homeCardModel({ ...loggedSource({ months: months(4), basisOverride: 'worst' }), unconverted: { currencies: ['EUR', 'GBP'], rowCount: 3 } }, settings(), READY);
    expect(model).toMatchObject({ state: 'unavailable', label: 'worst', unavailable: { currencies: ['EUR', 'GBP'] } });
    expect(snapshot().months).toHaveLength(4);
  });
});
