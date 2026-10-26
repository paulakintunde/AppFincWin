import * as fs from 'fs';
import * as path from 'path';
import { resolveScenarioPerson, type FixtureScenario } from './golden/adapter';
import extra from './golden/extra-d18.json';
import scenarios22 from './golden/scenarios22.json';
import { oldAnswer, type OldAnswer } from './golden/toOld';

// D-14 shadow baseline: today's engine answers per persona scenario. UPDATE_LEGACY_BASELINE=1 rewrites the committed file
// (T-05.1-28); a default run only compares.
const FILE = path.join(__dirname, 'golden', 'legacy-answers.json');
const ALL = [
  ...(scenarios22 as unknown as { scenarios: FixtureScenario[] }).scenarios,
  ...(extra as unknown as { scenarios: FixtureScenario[] }).scenarios,
];

type Baseline = { answers: Record<string, { month: OldAnswer; average: OldAnswer }> };

function compute(): Baseline {
  const answers: Baseline['answers'] = {};
  for (const s of [...ALL].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))) {
    const person = resolveScenarioPerson(s);
    answers[s.id] = { month: oldAnswer(person, s.purchase, 'month'), average: oldAnswer(person, s.purchase, 'average') };
  }
  return { answers };
}

describe('legacy baseline (D-14)', () => {
  it('D-14 baseline is reproducible', () => {
    const fresh = compute();
    if (process.env.UPDATE_LEGACY_BASELINE === '1') fs.writeFileSync(FILE, JSON.stringify(fresh, null, 2) + '\n');
    const committed = JSON.parse(fs.readFileSync(FILE, 'utf8')) as Baseline;
    expect(committed).toEqual(fresh);
  });

  it('has an entry for every scenario id and no extras', () => {
    const committed = JSON.parse(fs.readFileSync(FILE, 'utf8')) as Baseline;
    expect(Object.keys(committed.answers).sort()).toEqual(ALL.map((s) => s.id).sort());
  });
});
