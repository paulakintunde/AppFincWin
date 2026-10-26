import { LEGACY_STATE_OF_CODE } from '../constants';
import scenariosFile from './golden/scenarios22.json';
import {
  loadPersons,
  personById,
  resolveScenarioPerson,
  toCheckV2,
  toV3Inputs,
  type FixtureMonth,
  type FixtureScenario,
} from './golden/adapter';

const SCENARIOS = (scenariosFile as unknown as { scenarios: FixtureScenario[] }).scenarios;

const everyday = (m: FixtureMonth): number =>
  m.lines.filter((l) => l.role === 'spending' && !l.seriesId).reduce((a, l) => a + l.amount, 0);

describe('v3 golden fixtures', () => {
  it('fixture sanity', () => {
    const persons = loadPersons();
    expect(persons).toHaveLength(9);
    expect(new Set(persons.map((p) => p.id)).size).toBe(9);
    expect(SCENARIOS).toHaveLength(22);
    expect(SCENARIOS.map((s) => s.id)).toEqual(Array.from({ length: 22 }, (_, i) => String(i + 1).padStart(2, '0')));
    for (const s of SCENARIOS) expect(() => personById(s.person)).not.toThrow();
  });

  it('every scenario converts through the adapter', () => {
    for (const s of SCENARIOS) {
      const person = resolveScenarioPerson(s);
      expect(toV3Inputs(person).asOf).toBe(person.asOf);
      expect(toCheckV2(s.purchase).v).toBe(2);
    }
  });

  it('C15 Sam everyday by month', () => {
    const sam = personById('sam');
    const full = sam.months.filter((m) => m.full !== false);
    expect(full.map((m) => m.month)).toEqual(['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09']);
    expect(full.map(everyday)).toEqual([110000, 160000, 360000, 130000, 135000, 185000]);
    const sorted = full.map(everyday).sort((a, b) => a - b);
    // even count: half-up mean of the middle two (D-29)
    expect((sorted[2]! + sorted[3]! + 1) >> 1).toBe(147500);
  });

  it('C15 Sam pay and bills', () => {
    const sam = personById('sam');
    const live = sam.series.filter((s) => s.confirmed !== false && (s.status ?? 'live') === 'live');
    expect(live.find((s) => s.role === 'pay')?.amount).toBe(400000);
    expect(live.filter((s) => s.role === 'bill').reduce((a, s) => a + s.amount, 0)).toBe(180000);
    expect(live.find((s) => s.role === 'saving')).toMatchObject({ amount: 30000, savingMode: 'fixed' });
    const oct = sam.months.find((m) => m.month === '2026-10')!;
    expect(oct.full).toBe(false);
    expect(everyday(oct)).toBe(10000);
    expect(sam.asOf).toBe('2026-10-03');
  });

  it('C15 Sam suggested sum', () => {
    const sam = personById('sam');
    expect(sam.balance - 30000 - 137500 - 0 - sam.emergency!).toBe(240000);
    expect(sam.unspent!.amount).toBe(240000);
    // October: in 4,000 - out (1,500 + 300 + 100 + Erest 1,375 + 300) = 425
    expect(400000 - (150000 + 30000 + 10000 + 137500 + 30000)).toBe(42500);
  });

  it('D-28 every expectation has working', () => {
    for (const s of SCENARIOS) {
      expect(s.expect.working.length).toBeGreaterThan(20);
      expect(s.source.startsWith('v3 §12 #')).toBe(true);
      expect(s.source).toBe(`v3 §12 #${s.id}`);
    }
  });

  it('legacyState consistent with D-23', () => {
    for (const s of SCENARIOS) expect(s.expect.legacyState).toBe(LEGACY_STATE_OF_CODE[s.expect.code]);
  });
});
