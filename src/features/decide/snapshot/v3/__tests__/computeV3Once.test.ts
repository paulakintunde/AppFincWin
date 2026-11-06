// 05.4-33 ENG-13 / APP-03: the v3 inputs are built and prepared once per data change; each check is judged on the held
// Prepared. D-126 / D-127: the records date and the waiting-write count pass through the builder as notes only.
import type { CheckV2, Prepared } from '@/engine/decide/v3';
import * as engine from '@/engine/decide/v3';
import { carInputs, demoSource, sofaInputs } from '../../../__tests__/helpers/demoScenario';
import type { SnapshotSource } from '../../buildSnapshot';
import { buildV3Inputs } from '../buildV3Inputs';
import { computeV3, preparedV3 } from '../computeV3';
import { v3s } from './v3Fixtures';

const prepares: unknown[] = [];
jest.mock('@/engine/decide/v3', () => {
  const actual = jest.requireActual('@/engine/decide/v3');
  return {
    ...actual,
    prepare: (inputs: unknown) => {
      prepares.push(inputs);
      return actual.prepare(inputs);
    },
  };
});

const TODAY = '2026-10-03';
beforeEach(() => {
  prepares.length = 0;
});

describe('preparedV3 / computeV3: build once per data change', () => {
  it('the same source, settings and uses prepare once; every check is judged on that Prepared', () => {
    const source = demoSource(TODAY);
    const v3 = v3s({ income_types: ['salary'] });
    const a = computeV3(source, v3, sofaInputs);
    const b = computeV3(source, v3, carInputs);
    const c = computeV3(source, v3, sofaInputs);
    expect(prepares).toHaveLength(1);
    expect(c.result).toEqual(a.result);
    expect(typeof b.result.code).toBe('string');
    expect(preparedV3(source, v3).inputs).toBe(prepares[0]);
    expect(prepares).toHaveLength(1);
  });

  it('gives the same answer as evaluating the freshly built inputs', () => {
    const source = demoSource(TODAY);
    const v3 = v3s({ income_types: ['salary'] });
    const check = engine.readStoredCheck(sofaInputs).check as CheckV2;
    expect(computeV3(source, v3, sofaInputs).result).toEqual(engine.evaluate(buildV3Inputs(source, v3), check).result);
  });

  it('a changed row (a new source), other settings or other uses rebuild', () => {
    const source = demoSource(TODAY);
    const v3 = v3s({ income_types: ['salary'] });
    computeV3(source, v3, sofaInputs);
    const changed: SnapshotSource = { ...source, rows: source.rows.slice(1) };
    computeV3(changed, v3, sofaInputs);
    computeV3(source, v3s({ income_types: ['salary'] }), sofaInputs);
    computeV3(source, v3, sofaInputs, {});
    expect(prepares).toHaveLength(4);
    // each variant is now held: none rebuilds
    computeV3(changed, v3, sofaInputs);
    computeV3(source, v3, sofaInputs);
    expect(prepares).toHaveLength(4);
  });

  it('keeps at most four settings variants per source, newest first', () => {
    const source = demoSource(TODAY);
    const variants = [1, 2, 3, 4, 5].map(() => v3s({}));
    for (const v of variants) computeV3(source, v, sofaInputs);
    expect(prepares).toHaveLength(5);
    computeV3(source, variants[4]!, sofaInputs); // still held
    expect(prepares).toHaveLength(5);
    computeV3(source, variants[0]!, sofaInputs); // dropped, rebuilt
    expect(prepares).toHaveLength(6);
  });

  it('returns the Prepared the engine built', () => {
    const p: Prepared = preparedV3(demoSource(TODAY), null).prepared;
    expect(Array.isArray(p.readings)).toBe(true);
  });
});

describe('buildV3Inputs: records date and waiting writes (D-126, D-127)', () => {
  it('passes the records date through, null when the source has none', () => {
    const source = demoSource(TODAY);
    expect(buildV3Inputs(source, null).recordsAsOf).toBeNull();
    expect(buildV3Inputs({ ...source, recordsAsOf: null }, null).recordsAsOf).toBeNull();
    expect(buildV3Inputs({ ...source, recordsAsOf: '2026-10-01' }, null).recordsAsOf).toBe('2026-10-01');
  });

  it('counts waiting writes as a whole positive number, anything else as none', () => {
    const source = demoSource(TODAY);
    expect(buildV3Inputs(source, null).unsavedWrites).toBe(0);
    expect(buildV3Inputs({ ...source, unsavedWrites: 2 }, null).unsavedWrites).toBe(2);
    for (const n of [0, -1, 1.5, Number.NaN]) expect(buildV3Inputs({ ...source, unsavedWrites: n }, null).unsavedWrites).toBe(0);
  });

  it('a waiting write adds the unsaved note first and changes nothing else (APP-02)', () => {
    const source = demoSource(TODAY);
    const v3 = v3s({ income_types: ['salary'] });
    const none = computeV3(source, v3, sofaInputs).result;
    const one = computeV3({ ...source, unsavedWrites: 1 }, v3, sofaInputs).result;
    expect(one.notices[0]).toEqual({ code: 'unsaved_changes', values: {} });
    expect({ ...one, notices: one.notices.slice(1) }).toEqual(none);
  });
});
