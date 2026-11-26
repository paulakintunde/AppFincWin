// 09-22 (D-34): every holds-your-records probe has a source, and a feature below the person's level that holds such records is shown.
import { evaluateAccess } from '../evaluateAccess';
import { FEATURES, type FeatureDef } from '../featureRegistry';
import { deriveHolds, UNSOURCED, type HoldsDataProbeId, type HoldsSources } from '../holdsDataModel';

const acct = { currency: 'USD', archived_at: null, deleted_at: null, is_shared: false, tombstone_of: null };
const flags = {
  transfers: false,
  importedLines: false,
  weightSplits: false,
  amountSplits: false,
  receipts: false,
  splitLines: false,
  itemSplits: false,
};

/** Everything loaded and empty: nothing is held. */
const EMPTY: HoldsSources = {
  accounts: [acct],
  homeCurrency: 'USD',
  categories: [],
  series: [],
  goals: [],
  debts: [],
  holdings: [],
  lots: [],
  periods: [],
  refunds: [],
  splitDefaults: [],
  settlements: [],
  flags,
};

const cases: Record<HoldsDataProbeId, HoldsSources> = {
  recurringSeries: { series: [{}] },
  multipleAccounts: { accounts: [acct, acct] },
  foreignCurrency: { accounts: [{ ...acct, currency: 'EUR' }] },
  savingsGoals: { goals: [{ deleted_at: null, is_safety_net: false, monthly_amount: null }] },
  debts: { debts: [{ deleted_at: null }] },
  holdings: { holdings: [{}] },
  holdingLots: { lots: [{ deleted_at: null }] },
  statementPeriods: { periods: [{}] },
  refundLinks: { refunds: [{}] },
  transfers: { flags: { ...flags, transfers: true } },
  categoryCaps: { categories: [{ monthly_cap: 5000, archived_at: null, is_sample: false }] },
  goalContributions: { goals: [{ deleted_at: null, is_safety_net: true, monthly_amount: 2500 }] },
  debtPlan: { debts: [{ deleted_at: null, payoff_extra: 5000 }] },
  importedLines: { flags: { ...flags, importedLines: true } },
  weightSplits: { flags: { ...flags, weightSplits: true } },
  amountSplits: { flags: { ...flags, amountSplits: true } },
  categoryDefaultSplits: { splitDefaults: [{ category_ref: 'builtin:groceries' }] },
  sharedAccounts: { accounts: [{ ...acct, is_shared: true }] },
  settlements: { settlements: [{}] },
  receipts: { flags: { ...flags, receipts: true } },
  splitLines: { flags: { ...flags, splitLines: true } },
  itemSplits: { flags: { ...flags, itemSplits: true } },
};

describe('holds-data probes (09-22)', () => {
  it('no probe is left without a source', () => {
    expect(UNSOURCED).toEqual([]);
  });

  it('every probe in the registry has a case', () => {
    const ids = new Set(FEATURES.map((f) => f.holdsData).filter((x) => x !== null));
    expect([...ids].sort()).toEqual(Object.keys(cases).sort());
  });

  it('nothing is held when every source loaded and is empty', () => {
    const h = deriveHolds(EMPTY);
    for (const [k, v] of Object.entries(h)) expect([k, v]).toEqual([k, false]);
  });

  it('answers true for every probe while nothing has loaded (never hide during a load)', () => {
    const h = deriveHolds({});
    for (const [k, v] of Object.entries(h)) expect([k, v]).toEqual([k, true]);
  });

  describe.each(Object.keys(cases) as HoldsDataProbeId[])('%s', (probe) => {
    it('turns true when a record exists, and only that probe', () => {
      const h = deriveHolds({ ...EMPTY, ...cases[probe] });
      expect(h[probe]).toBe(true);
    });

    it('shows a feature below the person level that holds such records', () => {
      const h = deriveHolds({ ...EMPTY, ...cases[probe] });
      const defs = FEATURES.filter((f) => f.holdsData === probe);
      expect(defs.length).toBeGreaterThan(0);
      for (const def of defs) {
        const a = evaluateAccess({
          def: def as FeatureDef,
          level: 1,
          switchOn: undefined,
          planWritable: true,
          sharesInHousehold: true,
          holdsData: h[probe],
        });
        // Household and level 1: the feature is above the level (or shared), yet it is visible and fixed on.
        expect(a.visible).toBe(true);
        expect(a.holdsData).toBe(true);
        expect(a.switchable).toBe(false);
      }
    });

    it('hides it again when the records are gone (level 1, never switched on)', () => {
      const h = deriveHolds(EMPTY);
      const defs = FEATURES.filter((f) => f.holdsData === probe && f.minLevel > 1 && !f.needsHousehold);
      for (const def of defs) {
        const a = evaluateAccess({
          def: def as FeatureDef,
          level: 1,
          switchOn: undefined,
          planWritable: true,
          sharesInHousehold: true,
          holdsData: h[probe],
        });
        expect(a.visible).toBe(false);
      }
    });
  });
});
