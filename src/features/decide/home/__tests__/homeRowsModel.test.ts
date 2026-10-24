import type { DecideCheckRow } from '@/db/decideChecks';
import type { DecideSettingsRow } from '@/db/decideSettings';
import { emptyCheckInputs } from '../../snapshot/checkInputs';
import type { CheckInputs } from '../../snapshot/types';
import { TODAY, loggedSource, month, noneSource } from '../../snapshot/__tests__/helpers/snapshotFixtures';
import { changedOpenCount, linesSetCount, liveOpenChecks } from '../homeRowsModel';

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
