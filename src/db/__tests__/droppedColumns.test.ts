import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

// 05.5-21 (D-09): the four interim decide_settings columns are no longer used by the app.
const DROPPED = /share_pct|safety_net_protect|safety_net_size|safety_net_locked/;
const ROOTS = [join(process.cwd(), 'src'), join(process.cwd(), 'app')];

function walk(dir: string, out: string[]): void {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    if (name === '__tests__' || name === 'node_modules') continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|js|jsx)$/.test(name) && !/\.test\./.test(name)) out.push(full);
  }
}

describe('05.5-21 dropped decide_settings columns', () => {
  it('no non-test file under src or app names share_pct or the three safety_net_* columns', () => {
    const files: string[] = [];
    for (const r of ROOTS) walk(r, files);
    expect(files.length).toBeGreaterThan(0);
    const offenders = files.filter((f) => DROPPED.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });
});
