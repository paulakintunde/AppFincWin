import { LEGACY_STATE_OF_CODE } from '../constants';
import type { ReasonCode } from '../types';
import extraFile from './golden/extra-d18.json';
import {
  personById,
  resolveScenarioPerson,
  toCheckV2,
  toV3Inputs,
  type FixtureExpect,
  type FixtureScenario,
} from './golden/adapter';

/** An extra scenario may pin reasons, which FixtureExpect does not carry. */
type ExtraScenario = Omit<FixtureScenario, 'expect'> & { expect: FixtureExpect & { reasons?: ReasonCode[] } };

const EXTRAS = (extraFile as unknown as { scenarios: ExtraScenario[] }).scenarios;

const D18_IDS = [
  'd18-pay-in-4',
  'd18-deferred-6-then-24',
  'd18-deferred-unanswered',
  'd18-return-refund',
  'd18-shared-50-50',
  'd18-foreign',
  'd18-raise',
  'd18-job-loss',
  'd18-missed-paycheque',
];

describe('D-18 extra fixtures', () => {
  it('D-18 fixture set', () => {
    const ids = EXTRAS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of D18_IDS) expect(ids).toContain(id);
    for (const s of EXTRAS) {
      expect(() => personById(s.person)).not.toThrow();
      expect(s.expect.working.length).toBeGreaterThan(20);
      expect(s.source).toBe('D-18');
      const person = resolveScenarioPerson(s as FixtureScenario);
      expect(toV3Inputs(person).asOf).toBe(person.asOf);
      expect(toCheckV2(s.purchase).v).toBe(2);
    }
  });

  it('D-23 consistency', () => {
    for (const s of EXTRAS) expect(s.expect.legacyState).toBe(LEGACY_STATE_OF_CODE[s.expect.code]);
  });

  it('deferred plan without an answer is needs_input', () => {
    const s = EXTRAS.find((x) => x.id === 'd18-deferred-unanswered')!;
    expect(s.expect.code).toBe('needs_input');
    expect(s.expect.missing).toEqual(['pause_interest_not_answered']);
  });
});
