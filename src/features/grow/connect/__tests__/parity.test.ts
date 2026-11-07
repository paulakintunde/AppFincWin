// D-07 parity: the interim decide_settings columns and the migrated safety-net goal give Decide the same net and fund.
import { evaluate, readStoredCheck, type CheckV2, type V3Inputs } from '@/engine/decide/v3';
import { carInputs, demoSource, sofaInputs } from '@/features/decide/__tests__/helpers/demoScenario';
import { buildV3Inputs } from '@/features/decide/snapshot/v3/buildV3Inputs';
import { v3s } from '@/features/decide/snapshot/v3/__tests__/v3Fixtures';
import { safetyNetInputsOf, safetyNetPointOf } from '../index';
import type { GoalSourceRow } from '../types';

const TODAY = '2026-10-03';
const HOME = 'USD';
const ACCOUNT = 'acct-sav';

interface Cell {
  reserve: number | null;
  safety_net_size: number | null;
  protect: boolean;
  locked: boolean;
  reserve_account_id: string | null;
  currency: string; // the settings row's currency
}

/** TS mirror of the plan-06 SQL rule: a goal for every settings row. */
export function migrateSafetyNetRow(c: Cell, home: string): GoalSourceRow {
  return {
    id: 'net', name: 'Safety net', currency: c.currency === '' ? home : c.currency, target: c.safety_net_size, monthly_amount: null,
    ready_by: null, opening_saved: c.reserve ?? 0, kind: 'pot', account_id: c.reserve_account_id, check_id: null, done_at: null,
    deleted_at: null, is_safety_net: true, locked: true, protect: c.protect,
  };
}

const toHome = (amount: number, currency: string): number | null => (currency === HOME ? amount : null);
const checks: CheckV2[] = [sofaInputs, carInputs].map((s) => readStoredCheck(s).check as CheckV2);

const reserves = [null, 0, 130000];
const sizes = [null, 230000];
const accounts = [null, ACCOUNT];
const currencies = [HOME, 'GBP'];
const cells: Cell[] = [];
for (const reserve of reserves)
  for (const safety_net_size of sizes)
    for (const protect of [true, false])
      for (const locked of [true, false])
        for (const reserve_account_id of accounts)
          for (const currency of currencies) cells.push({ reserve, safety_net_size, protect, locked, reserve_account_id, currency });

function oldWay(c: Cell): V3Inputs {
  const base = demoSource(TODAY);
  const source = { ...base, settings: { ...base.settings!, currency: c.currency, reserve: c.reserve } };
  return buildV3Inputs(source, v3s({ safety_net_size: c.safety_net_size, safety_net_protect: c.protect, safety_net_locked: c.locked, reserve_account_id: c.reserve_account_id }));
}

function newWay(c: Cell, old: V3Inputs): V3Inputs {
  const { safetyNet, emergency } = safetyNetInputsOf(safetyNetPointOf([migrateSafetyNetRow(c, HOME)], [], toHome, HOME));
  return { ...old, safetyNet, emergency };
}

const results = (i: V3Inputs): unknown[] => checks.map((k) => evaluate(i, k));

describe('D-07 parity: interim columns versus the migrated safety-net goal', () => {
  it('the grid covers all 96 cells', () => {
    expect(cells).toHaveLength(96);
  });

  it.each(cells.map((c, n) => [n, c] as const))('cell %i gives the same answer', (_n, c) => {
    const old = oldWay(c);
    const neu = newWay(c, old);
    const emptyUnlinkedFund = c.currency === HOME && (c.reserve === null || c.reserve === 0) && c.reserve_account_id === null;
    if (emptyUnlinkedFund) {
      // Allowed difference 1: an empty unlinked fund no longer produces the fund-not-linked notice.
      // The old way carried an emergency fund of 0 (or none); the new way carries none. Everything else is equal.
      expect(neu.emergency).toBeNull();
      expect(results(neu)).toEqual(results({ ...old, emergency: null }));
      return;
    }
    if (!c.locked) {
      // Allowed difference 2: the safety net is always Locked (D-23). No screen ever wrote false, and plan 06 counts the production
      // rows with safety_net_locked = false before migrating. The new way equals the old way with locked set true.
      expect(neu.safetyNet?.locked).toBe(true);
      const lockedOld = oldWay({ ...c, locked: true });
      expect(neu.safetyNet).toEqual(lockedOld.safetyNet);
      expect(neu.emergency).toEqual(lockedOld.emergency);
      expect(results(neu)).toEqual(results(lockedOld));
      return;
    }
    expect(neu.safetyNet).toEqual(old.safetyNet);
    expect(neu.emergency).toEqual(old.emergency);
    expect(results(neu)).toEqual(results(old));
  });
});
