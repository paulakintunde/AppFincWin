import legacyFile from '../../__tests__/golden/legacy-v1-inputs.json';
import { personById, toV3Inputs } from '../../__tests__/golden/adapter';
import { CODE_PRECEDENCE } from '../../constants';
import { evaluate } from '../../evaluate';
import { readStoredCheck } from '../inputsV2';

type Entry = { source: string; shape: string; json: unknown };
const corpus = (legacyFile as unknown as { inputs: Entry[] }).inputs;

describe('I42 every v1 evaluates', () => {
  it('the corpus is not empty', () => {
    expect(corpus.length).toBeGreaterThan(0);
  });

  it.each(corpus.map((e, i) => ({ i, source: e.source, shape: e.shape, json: e.json })))(
    'v1 entry $i ($shape, $source) upgrades and evaluates to one of the six codes',
    ({ json }) => {
      const { check } = readStoredCheck(json);
      const ev = evaluate(toV3Inputs(personById('sam')), check);
      expect(CODE_PRECEDENCE).toContain(ev.result.code);
      expect(JSON.parse(JSON.stringify(ev.result))).toEqual(ev.result);
    }
  );

  it('v1 entries with the version stripped evaluate too (the seed stores them without v)', () => {
    for (const e of corpus) {
      const { v: _v, ...rest } = e.json as Record<string, unknown>;
      const { check } = readStoredCheck(rest);
      expect(() => evaluate(toV3Inputs(personById('sam')), check)).not.toThrow();
    }
  });
});
