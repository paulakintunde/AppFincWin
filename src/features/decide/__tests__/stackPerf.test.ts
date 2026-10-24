// A14 (non-gating timing smoke test): ten open checks, each chipped with the other nine.
import type { DecideCheckRow } from '@/db/decideChecks';
import { computeChip } from '../snapshot/computeCheck';
import { emptyCheckInputs, parseCheckInputs } from '../snapshot/checkInputs';
import { selectOtherChecks } from '../snapshot/stacking';
import { TODAY, loggedSource } from '../snapshot/__tests__/helpers/snapshotFixtures';

function row(i: number): DecideCheckRow {
  const inputs = { ...emptyCheckInputs('buy', TODAY), name: `Item ${i}`, advertised: 50_000 + i * 10_000, method: 'cash' as const };
  return {
    id: `c${String(i).padStart(2, '0')}`,
    household_id: 'h1',
    created_by: 'u1',
    kind: 'buy',
    name: inputs.name,
    inputs: inputs as unknown as Record<string, unknown>,
    status: 'open',
    furthest_step: 1,
    last_seen_state: null,
    last_seen_basis: null,
    reopened_from: null,
    decided_at: null,
    verdict_at_decision: null,
    estimate_day_one: null,
    estimate_monthly: null,
    wait_monthly: null,
    ready_by: null,
    broke_line: false,
    cooling_off_at: null,
    estimate_monthly_payment: null,
    estimate_running: null,
    is_sample: false,
    deleted_at: null,
    version: 1,
    updated_by: null,
    created_at: `2026-10-01T00:00:${String(i).padStart(2, '0')}Z`,
    updated_at: '2026-10-01T00:00:00Z',
  };
}

describe('stacking performance', () => {
  it('ten open checks recompute their chips in a bounded time', () => {
    const source = loggedSource();
    const checks = Array.from({ length: 10 }, (_, i) => row(i));
    const start = Date.now();
    const chips = checks.map((c) => {
      const others = selectOtherChecks({ checks, excludeId: c.id, source, today: TODAY });
      return computeChip(source, parseCheckInputs(c.inputs, TODAY), others.otherChecks);
    });
    const elapsed = Date.now() - start;
    console.log(`stackPerf: 10 chips with 9 stacked checks each took ${elapsed} ms (A14 target < 100 ms, not gated)`);
    expect(chips).toHaveLength(10);
    // A regression guard, not the A14 target: 18–22 ms alone, but past 1 s on a loaded machine running the full suite in
    // parallel (with or without coverage), so the bound is wide enough never to flake and still catches a pathological slowdown.
    expect(elapsed).toBeLessThan(5000);
  });
});
