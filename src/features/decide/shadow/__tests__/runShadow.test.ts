// 05.4-36 BO-08 (D-10, D-11, D-13, D-145): the phone-side shadow runner.
import * as runModule from '@/engine/decide/v3/shadow/run';
import { DECIDE_ENGINE_REVISION, SHADOW_SAMPLE_IDS, type V3Inputs } from '@/engine/decide/v3';
import { loadPersons, toV3Inputs } from '@/engine/decide/v3/__tests__/golden/adapter';
import { DbError } from '@/db/errors';
import type { ShadowRunRow } from '@/db/decideShadowRuns';
import { runShadow, sentKey, SHADOW_WAIT_DAYS, shadowRowsFor, waitKey, type RunShadowDeps } from '../runShadow';

const person = loadPersons()[0];
if (person === undefined) throw new Error('no golden person');
const inputs: V3Inputs = toV3Inputs(person);

function memoryStorage(seed: Record<string, string> = {}) {
  const map = new Map(Object.entries(seed));
  return {
    map,
    getItem: jest.fn(async (k: string) => map.get(k) ?? null),
    setItem: jest.fn(async (k: string, v: string) => {
      map.set(k, v);
    }),
  };
}

function depsWith(over: Partial<RunShadowDeps> = {}) {
  const storage = memoryStorage();
  const insert = jest.fn(async (_rows: readonly ShadowRunRow[]) => undefined);
  const report = { failedWrite: jest.fn(), failed: jest.fn() };
  const deps: RunShadowDeps = { enabled: true, userId: 'u1', inputs, online: () => true, storage, insert, report, ...over };
  return { deps, storage, insert, report };
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe('shadowRowsFor', () => {
  it('builds 6 rows in sample order with rounded figures and no strings but codes', () => {
    const { rows } = shadowRowsFor(inputs, 'u1');
    expect(rows.map((r) => r.sample_id)).toEqual([...SHADOW_SAMPLE_IDS]);
    for (const r of rows) {
      expect(r.user_id).toBe('u1');
      expect(r.engine_revision).toBe(DECIDE_ENGINE_REVISION);
      expect(r.reasons.length).toBeLessThanOrEqual(12);
      expect(Object.values(r.figures).every((v) => typeof v === 'number')).toBe(true);
      expect(r.reasons.every((c) => /^[mdrfcn]:[a-z0-9_]+$/.test(c))).toBe(true);
    }
  });
});

describe('runShadow', () => {
  it('decide_shadow false: nothing runs and nothing is sent', async () => {
    const spy = jest.spyOn(runModule, 'shadowRun');
    const { deps, insert, storage } = depsWith({ enabled: false });
    await expect(runShadow(deps)).resolves.toBe('off');
    expect(spy).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
    expect(storage.getItem).not.toHaveBeenCalled();
  });

  it('a tester with no mark: prepares once, judges the 6 samples, sends one insert of 6 rows, then sets the mark', async () => {
    const spy = jest.spyOn(runModule, 'shadowRun');
    const { deps, insert, storage } = depsWith();
    await expect(runShadow(deps)).resolves.toBe('sent');
    expect(spy).toHaveBeenCalledTimes(1);
    expect(insert).toHaveBeenCalledTimes(1);
    expect(insert.mock.calls[0]?.[0]).toHaveLength(6);
    expect(storage.map.get(sentKey(DECIDE_ENGINE_REVISION))).toBe(inputs.asOf);
    expect(sentKey('05.4.1')).toBe('fincwin:decide-shadow-sent:05.4.1');
  });

  it('already sent for this revision: nothing runs', async () => {
    const spy = jest.spyOn(runModule, 'shadowRun');
    const { deps, insert, storage } = depsWith();
    storage.map.set(sentKey(DECIDE_ENGINE_REVISION), '2026-10-01');
    await expect(runShadow(deps)).resolves.toBe('already_sent');
    expect(spy).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });

  it('a new revision runs again', async () => {
    const { deps, storage } = depsWith({ revision: '05.4.2' });
    storage.map.set(sentKey('05.4.1'), '2026-10-01');
    await expect(runShadow(deps)).resolves.toBe('sent');
    expect(storage.map.has(sentKey('05.4.2'))).toBe(true);
  });

  it('offline: skipped, nothing judged or sent, no mark', async () => {
    const spy = jest.spyOn(runModule, 'shadowRun');
    const { deps, insert, storage } = depsWith({ online: () => false });
    await expect(runShadow(deps)).resolves.toBe('offline');
    expect(spy).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it('an insert error: no mark, the code reported, nothing thrown', async () => {
    const { deps, storage, report } = depsWith({ insert: jest.fn(async () => Promise.reject(new DbError('check violation', '23514', 400))) });
    await expect(runShadow(deps)).resolves.toBe('failed');
    expect(report.failedWrite).toHaveBeenCalledWith('23514');
    expect(storage.map.has(sentKey(DECIDE_ENGINE_REVISION))).toBe(false);
  });

  it('a non-database insert error is reported as unknown', async () => {
    const { deps, report } = depsWith({ insert: jest.fn(async () => Promise.reject(new TypeError('Network request failed'))) });
    await expect(runShadow(deps)).resolves.toBe('failed');
    expect(report.failedWrite).toHaveBeenCalledWith('unknown');
  });

  it('an engine throw or a storage failure: reported with the fixed message, nothing thrown, no insert', async () => {
    jest.spyOn(runModule, 'shadowRun').mockImplementation(() => {
      throw new RangeError('minorUnits: 12.5 is not a safe integer');
    });
    const { deps, insert, report } = depsWith();
    await expect(runShadow(deps)).resolves.toBe('failed');
    expect(report.failed).toHaveBeenCalledWith();
    expect(insert).not.toHaveBeenCalled();
    const broken = depsWith({ storage: { getItem: async () => Promise.reject(new Error('disk')), setItem: async () => undefined } });
    await expect(runShadow(broken.deps)).resolves.toBe('failed');
    expect(broken.report.failed).toHaveBeenCalledTimes(1);
  });

  describe('records not up to date (D-145)', () => {
    const notReady = (asOf: string): V3Inputs => ({ ...inputs, asOf });
    beforeEach(() => {
      const actual = jest.requireActual<typeof runModule>('@/engine/decide/v3/shadow/run');
      // asOf is only moved for the waiting days; the run itself is judged on the person's own day.
      const real = actual.shadowRun(inputs);
      jest.spyOn(runModule, 'shadowRun').mockImplementation(() => ({ ...real, ready: false }));
    });

    it('waits on the first try and stores that day', async () => {
      const { deps, insert, storage } = depsWith({ inputs: notReady('2026-10-10') });
      await expect(runShadow(deps)).resolves.toBe('waiting');
      expect(insert).not.toHaveBeenCalled();
      expect(storage.map.get(waitKey(DECIDE_ENGINE_REVISION))).toBe('2026-10-10');
    });

    it('keeps waiting for up to 7 days, then sends marked not ready', async () => {
      const { deps, insert, storage } = depsWith({ inputs: notReady('2026-10-16') });
      storage.map.set(waitKey(DECIDE_ENGINE_REVISION), '2026-10-10');
      await expect(runShadow(deps)).resolves.toBe('waiting');
      expect(insert).not.toHaveBeenCalled();
      const later = depsWith({ inputs: notReady('2026-10-17') });
      later.storage.map.set(waitKey(DECIDE_ENGINE_REVISION), '2026-10-10');
      await expect(runShadow(later.deps)).resolves.toBe('sent');
      expect(SHADOW_WAIT_DAYS).toBe(7);
      expect(later.insert).toHaveBeenCalledTimes(1);
    });

    it('across a month end', async () => {
      const { deps, storage } = depsWith({ inputs: notReady('2026-11-03') });
      storage.map.set(waitKey(DECIDE_ENGINE_REVISION), '2026-10-27');
      await expect(runShadow(deps)).resolves.toBe('sent');
    });
  });
});
