import { readFileSync } from 'fs';
import { join } from 'path';
import { FEATURES, LEVELS, defaultOnAtLevel, featureById } from '../featureRegistry';

const MAP = readFileSync(
  join(__dirname, '../../../../.planning/phases/09-tiers-onboarding/09-LEVEL-MAP.md'),
  'utf8',
);

interface Row {
  id: string;
  area: string;
  minLevel: number;
  needsHousehold: boolean;
}

function parseRows(): Row[] {
  const rows: Row[] = [];
  for (const line of MAP.split(/\r?\n/)) {
    const m = /^\| ([a-z][a-zA-Z0-9.]*) \| (\w[\w ]*) \|/.exec(line);
    if (!m) continue;
    const cells = line.split('|').map((c) => c.trim());
    // cells[0] is '' (before the first pipe). The section 1 header row ("level | name") has no
    // numeric minLevel column, so it is skipped.
    if (!/^[1-4]$/.test(cells[5] ?? '')) continue;
    rows.push({
      id: m[1] ?? '',
      area: m[2] ?? '',
      minLevel: Number(cells[5]),
      needsHousehold: cells[6] === 'yes',
    });
  }
  return rows;
}

describe('featureRegistry vs signed 09-LEVEL-MAP.md', () => {
  const rows = parseRows();

  it('parses the signed table', () => {
    expect(rows).toHaveLength(35);
  });

  it('has the same ids in the same order', () => {
    expect(FEATURES.map((f) => f.id)).toEqual(rows.map((r) => r.id));
  });

  it('has the same area, minLevel and needsHousehold for every row', () => {
    for (const r of rows) {
      const f = featureById(r.id);
      expect(f).toBeDefined();
      expect({
        id: f?.id,
        area: f?.area,
        minLevel: f?.minLevel,
        needsHousehold: f?.needsHousehold,
      }).toEqual(r);
    }
  });

  it('contains none of the not-listed ids', () => {
    const ids = FEATURES.map((f) => f.id as string);
    for (const bad of [
      'receipts',
      'roundUps',
      'widgets',
      'bankLink',
      'tax',
      'licence',
      'coach',
      'alerts',
      'archive',
    ]) {
      expect(ids).not.toContain(bad);
    }
  });

  it('marks every hh.* entry as needing a household, and only those', () => {
    for (const f of FEATURES) {
      expect(f.needsHousehold).toBe(f.id.startsWith('hh.'));
    }
  });

  it('uses ids the database check accepts', () => {
    for (const f of FEATURES) expect(f.id).toMatch(/^[a-z][a-zA-Z0-9.]{1,40}$/);
  });

  it('has unique ids', () => {
    expect(new Set(FEATURES.map((f) => f.id)).size).toBe(FEATURES.length);
  });

  it('has the four fixed levels', () => {
    expect(LEVELS).toEqual([
      { level: 1, key: 'basics' },
      { level: 2, key: 'everyday' },
      { level: 3, key: 'fullPicture' },
      { level: 4, key: 'everything' },
    ]);
  });

  it('matches the signed count lines', () => {
    const counts = ([1, 2, 3, 4] as const).map((l) => defaultOnAtLevel(l).length);
    expect(counts).toEqual([5, 20, 32, 35]);
    const signed = ['Basics', 'Everyday', 'Full picture', 'Everything'].map((n) => {
      const m = new RegExp(`- ${n}: (\\d+) of (\\d+) on`).exec(MAP);
      return m ? Number(m[1]) : -1;
    });
    expect(counts).toEqual(signed);
  });
});
