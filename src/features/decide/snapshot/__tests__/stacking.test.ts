import type { DecideCheckRow } from '@/db/decideChecks';
import { emptyCheckInputs } from '../checkInputs';
import { selectOtherChecks } from '../stacking';
import { EMPTY_STACK, type CheckInputs } from '../types';
import { TODAY, loggedSource, noneSource, roughSource } from './helpers/snapshotFixtures';

function inputs(over: Partial<CheckInputs> = {}): CheckInputs {
  return { ...emptyCheckInputs('buy', TODAY), name: 'Laptop', advertised: 150_000, method: 'cash', ...over };
}

function checkRow(id: string, over: Partial<DecideCheckRow> = {}, inp: CheckInputs = inputs()): DecideCheckRow {
  return {
    id,
    household_id: 'h1',
    created_by: 'u1',
    kind: inp.kind,
    name: inp.name,
    inputs: inp as unknown as Record<string, unknown>,
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
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-01T00:00:00Z',
    ...over,
  };
}

const source = loggedSource();
const select = (checks: DecideCheckRow[], excludeId: string | null = null, src = source) =>
  selectOtherChecks({ checks, excludeId, source: src, today: TODAY });

describe('selectOtherChecks', () => {
  it('stacks complete open home-currency checks other than the one excluded', () => {
    const r = select([checkRow('a'), checkRow('b'), checkRow('c')], 'b');
    expect(r.openCount).toBe(2);
    expect(r.otherChecks).toHaveLength(2);
    expect(r.otherChecks.every((o) => o.purchaseRule === null)).toBe(true);
    expect(r.leftOutIncomplete).toBe(0);
    expect(r.leftOutCurrency).toBe(0);
  });

  it('never stacks waiting, bought, passed or deleted checks', () => {
    const r = select([
      checkRow('a', { status: 'waiting' }),
      checkRow('b', { status: 'bought' }),
      checkRow('c', { status: 'passed' }),
      checkRow('d', { deleted_at: '2026-10-02T00:00:00Z' }),
    ]);
    expect(r).toEqual({ otherChecks: [], openCount: 0, leftOutIncomplete: 0, leftOutCurrency: 0 });
  });

  it('counts drafts without a price or method instead of guessing', () => {
    const r = select([
      checkRow('a', {}, inputs({ advertised: null })),
      checkRow('b', {}, inputs({ method: null })),
      checkRow('c'),
    ]);
    expect(r.openCount).toBe(3);
    expect(r.leftOutIncomplete).toBe(2);
    expect(r.otherChecks).toHaveLength(1);
  });

  it('counts checks typed in another currency', () => {
    const r = select([checkRow('a', {}, inputs({ currency: 'EUR' })), checkRow('b', {}, inputs({ currency: 'USD' })), checkRow('c', {}, inputs({ currency: null }))]);
    expect(r.leftOutCurrency).toBe(1);
    expect(r.otherChecks).toHaveLength(2);
  });

  it('an open investment check stacks', () => {
    const invest = emptyCheckInputs('invest', TODAY);
    const r = select([checkRow('a', {}, { ...invest, name: 'Fund', advertised: 200_000 })]);
    expect(r.otherChecks).toHaveLength(1);
    expect(r.otherChecks[0]?.check.kind).toBe('invest');
  });

  it('keeps created_at then id order, deterministically', () => {
    const rows = [
      checkRow('z', { created_at: '2026-10-03T00:00:00Z' }, inputs({ advertised: 300_000 })),
      checkRow('b', { created_at: '2026-10-02T00:00:00Z' }, inputs({ advertised: 200_000 })),
      checkRow('a', { created_at: '2026-10-02T00:00:00Z' }, inputs({ advertised: 100_000 })),
      checkRow('a', { created_at: '2026-10-02T00:00:00Z' }, inputs({ advertised: 100_000 })),
    ];
    const prices = (r: ReturnType<typeof select>) => r.otherChecks.map((o) => (o.check.kind === 'buy' ? o.check.price : o.check.amount));
    const forward = prices(select(rows));
    const reversed = prices(select([...rows].reverse()));
    expect(forward).toEqual([100_000, 100_000, 200_000, 300_000]);
    expect(reversed).toEqual(forward);
  });

  it('stacks against rough figures too, and nothing when there is no source', () => {
    expect(select([checkRow('a')], null, roughSource()).otherChecks).toHaveLength(1);
    expect(select([checkRow('a')], null, noneSource())).toBe(EMPTY_STACK);
  });
});
