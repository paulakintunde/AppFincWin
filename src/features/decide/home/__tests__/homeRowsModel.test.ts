import type { DecideCheckRow } from '@/db/decideChecks';
import type { DecideSettingsRow } from '@/db/decideSettings';
import { emptyCheckInputs } from '../../snapshot/checkInputs';
import type { CheckInputs } from '../../snapshot/types';
import { TODAY, loggedSource, month, noneSource, roughSource } from '../../snapshot/__tests__/helpers/snapshotFixtures';
import { computeChip } from '../../snapshot/computeCheck';
import { parseCheckInputs } from '../../snapshot/checkInputs';
import { selectOtherChecks } from '../../snapshot/stacking';
import type { SnapshotResult } from '../../snapshot/types';
import { changedOpenCount, linesSetCount, liveOpenChecks, rebaselineSeen, withJudgeOn } from '../homeRowsModel';

function inputs(over: Partial<CheckInputs> = {}): CheckInputs {
  return { ...emptyCheckInputs('buy', TODAY), name: 'Laptop', advertised: 150_000, method: 'cash', ...over };
}

function row(id: string, over: Partial<DecideCheckRow> = {}, inp: CheckInputs = inputs()): DecideCheckRow {
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

const stressed = () => loggedSource({ months: ['2026-06', '2026-07', '2026-08', '2026-09'].map((m) => month(m, 500_000, 480_000)) });

describe('homeRowsModel', () => {
  it('D-99 changedOpenCount counts rows whose state moved since they were last seen', () => {
    const fits = row('a', { last_seen_state: 'fits' });
    expect(changedOpenCount(loggedSource(), [fits], TODAY)).toBe(0);
    expect(changedOpenCount(stressed(), [fits], TODAY)).toBe(1);
    expect(changedOpenCount(stressed(), [row('a', { last_seen_state: null })], TODAY)).toBe(0);
    expect(changedOpenCount(null, [fits], TODAY)).toBe(0);
    expect(changedOpenCount(noneSource(), [fits], TODAY)).toBe(0);
  });

  it('D-99 liveOpenChecks leaves out decided and deleted checks', () => {
    const live = liveOpenChecks([row('a'), row('b', { status: 'bought' }), row('c', { deleted_at: '2026-10-02T00:00:00Z' })]);
    expect(live.map((c) => c.id)).toEqual(['a']);
  });

  it('D-99 linesSetCount counts the limits the user set, and ignores money limits stamped in another currency', () => {
    expect(linesSetCount(null, 'USD')).toBe(0);
    const base = {
      currency: 'USD',
      reserve: 100_000,
      investing_floor: null,
      saving_floor: null,
      dsr_line: 36,
      housing_line: null,
      unsecured_multiple: null,
    } as unknown as DecideSettingsRow;
    expect(linesSetCount(base, 'USD')).toBe(2);
    expect(linesSetCount(base, 'EUR')).toBe(1);
    expect(linesSetCount({ ...base, reserve: null, dsr_line: null } as DecideSettingsRow, 'USD')).toBe(0);
  });

  it('D-103 linesSetCount counts housing_line and tops out at 6', () => {
    const all = {
      currency: 'USD',
      reserve: 1,
      investing_floor: 1,
      saving_floor: 1,
      dsr_line: '36',
      housing_line: '28',
      unsecured_multiple: 3,
    } as unknown as DecideSettingsRow;
    expect(linesSetCount(all, 'USD')).toBe(6);
    expect(linesSetCount({ ...all, housing_line: null }, 'USD')).toBe(5);
    expect(linesSetCount({ ...all, reserve: null, investing_floor: null, saving_floor: null, dsr_line: null, unsecured_multiple: null }, 'EUR')).toBe(1);
  });
});

// D-107 (user, 2026-10-24): a basis switch must not read as a data change. Four steady months, then a current month that
// spends nearly all its income: a 100 000 purchase is 'no' on Worst and This month, 'fits' on Average.
describe('D-107 rebaselineSeen', () => {
  const months = ['2026-06', '2026-07', '2026-08', '2026-09'].map((m) => month(m, 500_000, 300_000)).concat([month('2026-10', 500_000, 499_000)]);
  const base = (): SnapshotResult => loggedSource({ months });
  const cheap = inputs({ advertised: 100_000 });
  const on = (v: 'month' | 'worst' | 'average', src: SnapshotResult = base()) => withJudgeOn(src, v);

  it('D-107 withJudgeOn sets only the basis of a logged snapshot and leaves other kinds alone', () => {
    const w = on('worst');
    expect(w.kind === 'logged' && w.snapshot.basisOverride).toBe('worst');
    expect(w.judgeOn).toBe('worst');
    expect(w.monthFallback).toBeNull();
    expect(withJudgeOn(noneSource(), 'worst')).toEqual(noneSource());
    const src = base();
    withJudgeOn(src, 'average');
    expect(src.kind === 'logged' && src.snapshot.basisOverride).toBeNull();
  });

  it('D-107 switching the basis does not mark checks changed', () => {
    const seenNo = row('a', { last_seen_state: 'no' }, cheap);
    expect(changedOpenCount(on('worst'), [seenNo], TODAY)).toBe(0);
    expect(changedOpenCount(on('average'), [seenNo], TODAY)).toBe(1); // without the re-baseline it would read as changed
    const moves = rebaselineSeen(on('worst'), on('average'), [seenNo], TODAY);
    expect(moves).toEqual([{ id: 'a', state: 'fits' }]);
    const after = row('a', { last_seen_state: 'fits' }, cheap);
    expect(changedOpenCount(on('average'), [after], TODAY)).toBe(0);
  });

  it('D-107 a real data change before the switch still shows changed', () => {
    const stale = row('a', { last_seen_state: 'adjust' }, cheap); // the old basis says 'no': the data already moved
    expect(rebaselineSeen(on('worst'), on('average'), [stale], TODAY)).toEqual([]);
    expect(changedOpenCount(on('average'), [stale], TODAY)).toBe(1);
  });

  it('D-107 switching back restores the original states with no markers', () => {
    let r = row('a', { last_seen_state: 'no' }, cheap);
    const there = rebaselineSeen(on('worst'), on('average'), [r], TODAY);
    r = { ...r, last_seen_state: there[0]?.state ?? null };
    expect(changedOpenCount(on('average'), [r], TODAY)).toBe(0);
    const back = rebaselineSeen(on('average'), on('worst'), [r], TODAY);
    expect(back).toEqual([{ id: 'a', state: 'no' }]);
    r = { ...r, last_seen_state: back[0]?.state ?? null };
    expect(r.last_seen_state).toBe('no');
    expect(changedOpenCount(on('worst'), [r], TODAY)).toBe(0);
  });

  it('D-107 first-read and incomplete checks are not rebaselined', () => {
    const unseen = row('a', { last_seen_state: null }, cheap);
    const incomplete = row('b', { last_seen_state: 'fits' }, inputs({ advertised: null }));
    expect(rebaselineSeen(on('worst'), on('average'), [unseen, incomplete], TODAY)).toEqual([]);
    const rough = roughSource();
    expect(rebaselineSeen(rough, withJudgeOn(rough, 'average'), [row('c', { last_seen_state: 'fits' }, cheap)], TODAY)).toEqual([]);
    expect(rebaselineSeen(null, on('average'), [unseen], TODAY)).toEqual([]);
    expect(rebaselineSeen(on('worst'), null, [unseen], TODAY)).toEqual([]);
  });

  it('D-107 each check is judged with the other open checks on both bases', () => {
    const a = row('a', { last_seen_state: 'no' }, cheap);
    const b = row('b', { last_seen_state: 'no' }, inputs({ name: 'Phone', advertised: 90_000 }));
    const open = [a, b];
    const expected = (src: SnapshotResult, r: DecideCheckRow) => {
      const others = selectOtherChecks({ checks: open, excludeId: r.id, source: src, today: TODAY }).otherChecks;
      const chip = computeChip(src, parseCheckInputs(r.inputs, TODAY), others, r.id);
      return chip.status === 'logged' ? chip.state : null;
    };
    const w = on('worst');
    const av = on('average');
    const moves = rebaselineSeen(w, av, open, TODAY);
    const want = open
      .filter((r) => expected(w, r) === r.last_seen_state && expected(av, r) !== expected(w, r))
      .map((r) => ({ id: r.id, state: expected(av, r) }));
    expect(moves).toEqual(want);
    expect(moves.length).toBeGreaterThan(0);
  });

  it('D-107 rebaselineSeen is pure and returns only the checks whose state differs between the bases', () => {
    const a = row('a', { last_seen_state: 'no' }, cheap);
    const frozen = JSON.stringify(a);
    expect(rebaselineSeen(on('month'), on('worst'), [a], TODAY)).toEqual([]); // month and worst agree: nothing to move
    const first = rebaselineSeen(on('worst'), on('average'), [a], TODAY);
    expect(rebaselineSeen(on('worst'), on('average'), [a], TODAY)).toEqual(first);
    expect(JSON.stringify(a)).toBe(frozen);
    expect(rebaselineSeen(on('worst'), on('worst'), [a], TODAY)).toEqual([]);
  });

  it('D-107 under a month fallback the month choice rebaselines onto the worst result', () => {
    const waiting: SnapshotResult = { ...base(), monthUnconverted: { currencies: ['EUR'], rowCount: 1, rowsByCurrency: { EUR: 1 } } };
    const m = withJudgeOn(waiting, 'month');
    expect(m.kind === 'logged' && m.snapshot.basisOverride).toBe('worst');
    expect(m.judgeOn).toBe('month');
    expect(m.monthFallback).toEqual({ currencies: ['EUR'] });
    const seenFits = row('a', { last_seen_state: 'fits' }, cheap);
    expect(rebaselineSeen(withJudgeOn(waiting, 'average'), m, [seenFits], TODAY)).toEqual([{ id: 'a', state: 'no' }]);
  });
});
