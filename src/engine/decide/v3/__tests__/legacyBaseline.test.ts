// 05.4 BO-05: legacy-answers.json is a record, not an oracle (deleted in 05.5)
// The old engine's answers were made by the prototype and no longer decide pass or fail. What stays here is the adapter
// mapping check: every scenario person still resolves and the old-engine adapter still maps it. Only the table and the
// reviewed diff (reviewed/) decide what is right.
import { resolveScenarioPerson, type FixtureScenario } from './golden/adapter';
import extra from './golden/extra-d18.json';
import scenarios22 from './golden/scenarios22.json';
import { oldAnswer } from './golden/toOld';

const ALL = [
  ...(scenarios22 as unknown as { scenarios: FixtureScenario[] }).scenarios,
  ...(extra as unknown as { scenarios: FixtureScenario[] }).scenarios,
];

describe('legacy adapter mapping (record only)', () => {
  it('every scenario id is unique', () => {
    expect(new Set(ALL.map((s) => s.id)).size).toBe(ALL.length);
  });

  it('every scenario person resolves and maps to an old-engine answer without throwing', () => {
    for (const s of ALL) {
      const person = resolveScenarioPerson(s);
      expect(person.id).toBeTruthy();
      expect(() => oldAnswer(person, s.purchase, 'month')).not.toThrow();
    }
  });
});
