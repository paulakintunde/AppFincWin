// 10-16 (D-13, DAT-01, T-10-16-01): archive state is a view filter. No money-answer module may import it, and under src/features/record only
// Activity's month switcher and search may. A static scan, in the style of exportManifest.test.ts.
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative, sep } from 'path';

const ROOT = join(__dirname, '../../../..');
const SRC = join(ROOT, 'src');

const ARCHIVE_REF = /(@\/engine\/archive|@\/features\/archive|@\/data\/queries\/archivedMonths|@\/data\/mutations\/archivedMonths|queryKeys\.archivedMonths|\/engine\/archive['"/]|\/features\/archive['"/]|queries\/archivedMonths['"])/;

const MONEY_DIRS = [
  'src/features/decide',
  'src/engine/decide',
  'src/features/home',
  'src/features/grow',
  'src/data/queries',
  'src/engine/month',
  'src/engine/activity',
];
const MONEY_EXEMPT = new Set(['src/data/queries/archivedMonths.ts']);

/** Everything under src/features/record that may read archive state (D-13: the month switcher and Activity search only). */
export const RECORD_ALLOW_LIST: readonly string[] = [
  'src/features/record/activity/header/MonthRow.tsx',
  'src/features/record/activity/MonthSwitcher.tsx',
  'src/features/record/activity/useActivityViewModel.ts',
];

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === 'node_modules' || name === '__tests__') continue;
      out.push(...walk(full));
    } else if (/\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}

const rel = (p: string): string => relative(ROOT, p).split(sep).join('/');

function filesIn(dirs: readonly string[]): string[] {
  return dirs.flatMap((d) => walk(join(ROOT, d))).map(rel);
}

function importers(files: readonly string[], read: (f: string) => string): string[] {
  return files.filter((f) => ARCHIVE_REF.test(read(f)));
}

/** The checker: files that reference archive state but are not allowed to. */
export function disallowedRecordImporters(files: readonly string[], read: (f: string) => string, allow: readonly string[]): string[] {
  return importers(files, read).filter((f) => !allow.includes(f));
}

const readReal = (f: string): string => readFileSync(join(ROOT, f), 'utf8');

describe('archive import guard (D-13)', () => {
  it('scans a real tree', () => {
    expect(statSync(SRC).isDirectory()).toBe(true);
    expect(filesIn(MONEY_DIRS).length).toBeGreaterThan(50);
  });

  it('no money-answer module reads archive state', () => {
    const files = filesIn(MONEY_DIRS).filter((f) => !MONEY_EXEMPT.has(f));
    expect(importers(files, readReal)).toEqual([]);
  });

  it('under src/features/record only the allow-listed files read archive state', () => {
    const files = filesIn(['src/features/record']);
    expect(disallowedRecordImporters(files, readReal, RECORD_ALLOW_LIST)).toEqual([]);
  });

  it('the checker fails on a fake extra importer', () => {
    const fake = 'src/features/record/activity/ActivityTotals.tsx';
    const read = (f: string): string => (f === fake ? "import { x } from '@/features/archive/useArchiveState';" : '');
    expect(disallowedRecordImporters([fake, RECORD_ALLOW_LIST[0] as string], read, RECORD_ALLOW_LIST)).toEqual([fake]);
  });

  it('the checker passes a file that only uses the allow-list', () => {
    const f = RECORD_ALLOW_LIST[0] as string;
    const read = (): string => "import { visibleMonths } from '@/engine/archive';";
    expect(disallowedRecordImporters([f], read, RECORD_ALLOW_LIST)).toEqual([]);
  });
});
