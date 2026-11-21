import { applyOnb } from '../applyOnb';
import { FEATURES } from '../featureRegistry';

const HH = FEATURES.filter((f) => f.id.startsWith('hh.')).map((f) => f.id);

describe('applyOnb', () => {
  it('produces no overrides when everything is skipped', () => {
    expect(applyOnb({}, 2)).toEqual({});
  });

  it('turns on debt features for goal debt or any debt answer', () => {
    expect(applyOnb({ goal: 'debt' }, 3)).toEqual({ debts: true, payoffPlan: true });
    expect(applyOnb({ debt: 'card' }, 3)).toEqual({ debts: true, payoffPlan: true });
    expect(applyOnb({ debt: 'none' }, 2)).toEqual({});
  });

  it('turns on investments, and lots for lots', () => {
    expect(applyOnb({ inv: 'some' }, 3)).toEqual({ investing: true });
    expect(applyOnb({ inv: 'lots' }, 4)).toEqual({ investing: true, lots: true });
    expect(applyOnb({ inv: 'no' }, 2)).toEqual({});
  });

  it('turns on every household feature when sharing', () => {
    for (const share of ['partner', 'household', 'both'] as const) {
      const out = applyOnb({ share }, 2);
      expect(Object.keys(out).sort()).toEqual([...HH].sort());
      expect(Object.values(out).every((v) => v === true)).toBe(true);
    }
    expect(applyOnb({ share: 'no' }, 2)).toEqual({});
  });

  it('turns on caps for goal stop', () => {
    expect(applyOnb({ goal: 'stop' }, 2)).toEqual({ caps: true });
  });

  it('turns on goals for goal save or a save answer', () => {
    expect(applyOnb({ goal: 'save' }, 2)).toEqual({ goals: true });
    expect(
      applyOnb({ save: { name: 'Car', targetMinor: 100000, perMonthMinor: 5000 } }, 2),
    ).toEqual({ goals: true });
  });

  it('turns on multiCurrency only when the currency differs from home', () => {
    expect(applyOnb({ cur: 'EUR' }, 3, { homeCurrency: 'USD' })).toEqual({ multiCurrency: true });
    expect(applyOnb({ cur: 'USD' }, 3, { homeCurrency: 'USD' })).toEqual({});
  });

  it('never produces a key for a dropped or unknown feature', () => {
    const ids = new Set<string>(FEATURES.map((f) => f.id));
    const out = applyOnb(
      {
        goal: 'save',
        cur: 'EUR',
        shape: 'lumpy',
        debt: 'several',
        inv: 'lots',
        share: 'both',
        watch: 'none',
        save: { name: 'x', targetMinor: 1, perMonthMinor: 1 },
      },
      4,
      { homeCurrency: 'USD' },
    );
    for (const k of Object.keys(out)) expect(ids.has(k)).toBe(true);
    for (const dropped of ['forecast', 'alerts', 'tax']) expect(out).not.toHaveProperty(dropped);
  });
});
