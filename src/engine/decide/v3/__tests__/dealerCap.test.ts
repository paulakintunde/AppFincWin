/**
 * 05.4 CMP-F08 (05.4-38): the dealer-cap figure is unsourced, so the v3 engine never reads it. The old engine's field stays
 * (marketDefaults.ts, commented) until 05.5 deletes it. The copy side ("most dealers") is banned in decideCopy.test.ts.
 */
import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

const V3 = join(__dirname, '..');

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === '__tests__' ? [] : sources(path);
    return name.endsWith('.ts') ? [path] : [];
  });
}

describe('05.4-38 CMP-F08: no dealer cap in v3', () => {
  it('no v3 source file reads dealerCap', () => {
    const files = sources(V3);
    expect(files.length).toBeGreaterThan(50);
    expect(files.filter((f) => /dealerCap/.test(readFileSync(f, 'utf8')))).toEqual([]);
  });
});
