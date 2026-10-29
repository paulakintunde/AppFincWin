import { carInputs, demoSource, sofaInputs } from '../../../__tests__/helpers/demoScenario';
import * as snapshotModule from '../../buildSnapshot';
import { computeV3, computeV3Many } from '../computeV3';
import { v3s } from './v3Fixtures';

const source = () => demoSource('2026-10-03');
const cover = (checkId: string) => ({ kind: 'volatile_cover' as const, key: checkId, amount: null, bool_value: true, on_date: null, check_id: checkId });

describe('computeV3Many (criterion 1: one computation for many checks)', () => {
  it('gives each check exactly what computeV3 gives, with the saved volatile-cover answer read per id', () => {
    const settings = v3s({ answers: [cover('b')] });
    for (const v3 of [null, settings]) {
      const many = computeV3Many(source(), v3, [{ id: 'a', inputs: sofaInputs }, { id: 'b', inputs: carInputs }]);
      expect(many.size).toBe(2);
      expect(many.get('a')).toEqual(computeV3(source(), v3, sofaInputs, undefined, 'a'));
      expect(many.get('b')).toEqual(computeV3(source(), v3, carInputs, undefined, 'b'));
    }
  });

  it('an empty list gives an empty map and builds nothing', () => {
    const spy = jest.spyOn(snapshotModule, 'buildDecideSnapshot');
    expect(computeV3Many(source(), null, []).size).toBe(0);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('builds the snapshot once for the whole list', () => {
    const spy = jest.spyOn(snapshotModule, 'buildDecideSnapshot');
    computeV3Many(source(), null, [{ id: 'a', inputs: sofaInputs }, { id: 'b', inputs: carInputs }, { id: 'c', inputs: sofaInputs }]);
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it('passes the pending-write count through', () => {
    const many = computeV3Many(source(), null, [{ id: 'a', inputs: sofaInputs }], 2);
    expect(many.get('a')!.result.notices.map((n) => n.code)).toContain('unsaved_changes');
  });
});
