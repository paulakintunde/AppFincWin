// BO-07 point 7 (accounts) contract. Owner: plan 05.5-17. AccountSheet is the only writer of overdraft limit and purpose.
// The title is frozen in src/test/contracts/contractManifest.test.ts. A source scan, so the engine test imports no feature code.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const DECIDE = join(process.cwd(), 'src', 'features', 'decide');
const WRITERS = /@\/data\/mutations\/(accountUse|accounts)(['./])/;

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name !== '__tests__') out.push(...sourceFiles(full));
    } else if (/\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

describe('BO-07 point 7: accounts', () => {
  it('Decide never writes an account overdraft limit or purpose; it opens AccountSheet', () => {
    const files = sourceFiles(DECIDE);
    expect(files.length).toBeGreaterThan(50);
    const offenders = files.filter((f) => WRITERS.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
    const records = readFileSync(join(DECIDE, 'screens', 'setup', 'items', 'RecordsSetup.tsx'), 'utf8');
    expect(records).toContain('/accounts/');
    expect(records).toContain('?edit=1');
  });
});
