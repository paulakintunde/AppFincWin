// 06-16 (G04a, criterion 7): the preview re-judges open checks with the same computeV3 as Decide, on a source whose flagged goal has
// the new size. Pure: no React, no I/O.
import { carInputs, demoSource, sofaInputs } from '@/features/decide/__tests__/helpers/demoScenario';
import type { SnapshotSource } from '@/features/decide/snapshot/buildSnapshot';
import { computeV3 } from '@/features/decide/snapshot/v3/computeV3';
import { SETTINGS } from '@/features/decide/snapshot/v3/__tests__/growScenarios';
import { coverWeeks, essentialMonthOf, netStateOf, previewNetSize, withNetSize } from '../netPreview';

const TODAY = '2026-10-03';

/** The demo month with every account's use stated, so the answers are real verdicts, and a flagged net holding $5,000. */
function sourceWith(netTarget: number | null): SnapshotSource {
  const base = demoSource(TODAY);
  return {
    ...base,
    accounts: base.accounts.map((a) => ({ ...a, use: a.id === 'demo-acct-savings' || a.id === 'demo-acct-investments' ? 'untouched' : 'everyday' })),
    goals: [
      {
        id: 'net', kind: 'pot', check_id: null, currency: 'USD', target: netTarget, monthly_amount: null, ready_by: null, opening_saved: 500_000,
        done_at: null, deleted_at: null, account_id: 'demo-acct-savings', name: 'Safety net', is_safety_net: true, locked: true, protect: true,
      },
    ],
  };
}

const checks = [
  { id: 'c-sofa', name: 'Sofa', inputs: sofaInputs },
  { id: 'c-car', name: 'Car', inputs: carInputs },
];

describe('netStateOf', () => {
  it.each([
    [{ code: 'fits_month', variant: null }, 'fits'],
    [{ code: 'fits_unspent', variant: 'tight' }, 'tight'],
    [{ code: 'fits_uses_net', variant: null }, 'dips'],
    [{ code: 'emergency_use', variant: null }, 'dips'],
    [{ code: 'not_yet', variant: null }, 'notYet'],
    [{ code: 'monthly_short', variant: null }, 'notYet'],
    [{ code: 'needs_input', variant: null }, 'needsInput'],
  ] as const)('%j reads as %s', (result, state) => {
    expect(netStateOf(result)).toBe(state);
  });
});

describe('withNetSize', () => {
  it('changes only the live flagged goal', () => {
    const src = sourceWith(300_000);
    const other = { ...src.goals[0]!, id: 'g2', is_safety_net: false, target: 1_000 };
    const out = withNetSize({ ...src, goals: [...src.goals, other] }, 777_000);
    expect(out.goals.find((g) => g.id === 'net')?.target).toBe(777_000);
    expect(out.goals.find((g) => g.id === 'g2')?.target).toBe(1_000);
    expect(src.goals[0]!.target).toBe(300_000);
  });

  it('adds a locked, protected net when there is none', () => {
    const src = { ...demoSource(TODAY), goals: [] };
    const out = withNetSize(src, 230_000);
    expect(out.goals).toHaveLength(1);
    expect(out.goals[0]).toMatchObject({ is_safety_net: true, locked: true, protect: true, target: 230_000, deleted_at: null });
  });

  it('does not count a removed flagged goal as the net', () => {
    const src = sourceWith(300_000);
    const gone = { ...src, goals: [{ ...src.goals[0]!, deleted_at: '2026-09-01T00:00:00Z' }] };
    expect(withNetSize(gone, 230_000).goals).toHaveLength(2);
  });
});

describe('previewNetSize', () => {
  it('the same size changes nothing', () => {
    const rows = previewNetSize({ source: sourceWith(300_000), v3: SETTINGS, checks, newSize: 300_000 });
    expect(rows).toHaveLength(2);
    for (const r of rows) expect(r.after).toBe(r.before);
  });

  it('before and after are exactly what computeV3 gives on the two sources', () => {
    const source = sourceWith(300_000);
    for (const size of [100, 50_000, 900_000, 5_000_000]) {
      const rows = previewNetSize({ source, v3: SETTINGS, checks, newSize: size });
      const changed = withNetSize(source, size);
      rows.forEach((r, i) => {
        const c = checks[i]!;
        expect(r.before).toBe(netStateOf(computeV3(source, SETTINGS, c.inputs, undefined, c.id).result));
        expect(r.after).toBe(netStateOf(computeV3(changed, SETTINGS, c.inputs, undefined, c.id).result));
      });
    }
  });

  it('a bigger size than what is saved moves the sofa from Fits to Tight, and a small one leaves it', () => {
    const source = sourceWith(300_000);
    const sofa = (size: number) => previewNetSize({ source, v3: SETTINGS, checks: [checks[0]!], newSize: size })[0]!;
    expect(sofa(600_000)).toMatchObject({ before: 'fits', after: 'tight' });
    expect(sofa(100_000)).toMatchObject({ before: 'fits', after: 'fits' });
  });

  it('carries the name and the stored price, or null with no price', () => {
    const rows = previewNetSize({ source: sourceWith(300_000), v3: SETTINGS, checks: [...checks, { id: 'c-empty', name: 'Draft', inputs: {} }], newSize: 300_000 });
    expect(rows.map((r) => r.name)).toEqual(['Sofa', 'Car', 'Draft']);
    expect(rows[0]!.price).toBeGreaterThan(0);
    expect(rows[2]!.price).toBeNull();
  });

  it('with no open checks there is nothing to preview', () => {
    expect(previewNetSize({ source: sourceWith(300_000), v3: SETTINGS, checks: [], newSize: 1 })).toEqual([]);
  });
});

describe('essentialMonthOf and coverWeeks', () => {
  it('reads one usual month of essential costs from the prepared inputs', () => {
    const month = essentialMonthOf(sourceWith(null), SETTINGS);
    expect(month).not.toBeNull();
    expect(month as number).toBeGreaterThan(0);
  });

  it('rounds weeks to the nearest half', () => {
    // LEDGER: $1,300 of a $2,775 month is about 2 weeks; $2,300 about 3.5.
    expect(coverWeeks(130_000, 277_500)).toBe(2);
    expect(coverWeeks(230_000, 277_500)).toBe(3.5);
  });

  it('is null with no month or a negative amount', () => {
    expect(coverWeeks(100, null)).toBeNull();
    expect(coverWeeks(100, 0)).toBeNull();
    expect(coverWeeks(-1, 1000)).toBeNull();
  });
});
