// FROZEN manifest of the 14 BO-07 contract titles (05.5 D-08, Pitfall 4). Later plans never edit this file:
// switching a todo on turns test.todo('t') into it('t', ...) with the same title, which still passes here.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..', '..');
const M = 'src/engine/month/__tests__/';
const P8 = 'src/engine/household/__tests__/';

interface Entry {
  title: string;
  ownerPlan: string;
  files: string[];
}

const P6 = [M + 'bo07.point6.contract.test.ts', P8 + 'bo07.point6.contract.test.ts'];
const PH8 = [M + 'bo07.phase8.contract.test.ts', P8 + 'bo07.phase8.contract.test.ts'];

const FROZEN: Entry[] = [
  { title: 'a record is personal unless shared', ownerPlan: '08-25', files: P6 },
  { title: 'my share of a shared line is its stored split, never recomputed from current weights', ownerPlan: '08-25', files: P6 },
  { title: "a partner's money counts only with that partner's opt-in (off by default)", ownerPlan: '08-25', files: P6 },
  { title: "a partner's personal line never reaches my figures", ownerPlan: '08-25', files: P6 },
  { title: 'settlements count as neither spending nor income in Activity totals', ownerPlan: '08-30', files: PH8 },
  { title: 'settlements count as neither spending nor income in the month picture', ownerPlan: '08-30', files: PH8 },
  { title: "one income profile per member; a partner's pay never overwrites mine", ownerPlan: '08.1', files: PH8 },
  { title: 'database rules gate reading; countsForMe gates counting; no screen adds its own filter', ownerPlan: '08-25', files: PH8 },
  { title: 'leftAfterPlans equals homeFigure(prepared)', ownerPlan: '05.5-08', files: [M + 'bo07.point1.behaviour.contract.test.ts'] },
  { title: 'Home small line and Decide lead show the same figure', ownerPlan: '05.5-14', files: [M + 'bo07.point1.behaviour.contract.test.ts'] },
  { title: 'Decide never writes an account overdraft limit or purpose; it opens AccountSheet', ownerPlan: '05.5-17', files: [M + 'bo07.point7.accounts.contract.test.ts'] },
  { title: 'a category cap set from Decide or from Activity writes the same categories.monthly_cap', ownerPlan: '05.5-15', files: [M + 'bo07.cap.contract.test.ts'] },
  { title: 'a cost that stops ends its Activity bill with end_reason stopped', ownerPlan: '05.5-13', files: [M + 'bo07.recordAsBought.contract.test.ts'] },
  { title: 'fixed running costs become Activity bills; varying costs become expected spending', ownerPlan: '05.5-13', files: [M + 'bo07.recordAsBought.contract.test.ts'] },
];

function read(rel: string): string | null {
  const p = join(ROOT, rel);
  return existsSync(p) ? readFileSync(p, 'utf8') : null;
}

function present(source: string, title: string): boolean {
  for (const q of ["'", '"', '`']) {
    const quoted = q + title.split(q).join('\\' + q) + q;
    for (const head of ['test.todo(', 'it(', 'test(']) {
      if (source.includes(head + quoted)) return true;
    }
  }
  return false;
}

describe('BO-07 contract manifest (frozen)', () => {
  it.each(FROZEN.map((e) => [e.title, e] as const))('keeps "%s"', (_t, entry) => {
    const sources = entry.files.map(read).filter((s): s is string => s !== null);
    if (!sources.some((s) => present(s, entry.title))) {
      throw new Error(
        `A BO-07 contract title disappeared. Keep the exact title when switching a todo on (05.5 Pitfall 4). Missing: ${entry.title} (owner ${entry.ownerPlan})`,
      );
    }
  });

  it('has no unlisted todo in the 05.5 contract files', () => {
    const known = new Set(FROZEN.map((e) => e.title));
    const unlisted: string[] = [];
    const dir = join(ROOT, M);
    for (const f of readdirSync(dir).filter((n) => /^bo07\..*\.contract\.test\.ts$/.test(n))) {
      const src = readFileSync(join(dir, f), 'utf8');
      for (const m of src.matchAll(/test\.todo\((['"`])((?:\\.|(?!\1).)*)\1\)/g)) {
        const title = m[2].replace(/\\(['"`])/g, '$1');
        if (!known.has(title)) unlisted.push(`${f}: ${title}`);
      }
    }
    expect(unlisted).toEqual([]);
  });
});
