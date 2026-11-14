// CMP-F10 (05.5-07): the retired screen name never ships. The screen is "Your money rules".
import fs from 'fs';
import path from 'path';

const SKIP_DIRS = new Set(['__tests__', 'node_modules']);
const SOURCE = /\.(ts|tsx)$/;
const TEST_FILE = /\.test\.tsx?$/;

function walk(dir: string, out: string[]): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (!SKIP_DIRS.has(e.name)) walk(full, out);
    } else if (SOURCE.test(e.name) && !TEST_FILE.test(e.name)) {
      out.push(full);
    }
  }
  return out;
}

describe('CMP-F10 retired screens', () => {
  it("CMP-F10: retired screen text found; the name is 'Your money rules'", () => {
    const files = [...walk('src', []), ...walk('app', [])];
    expect(files.length).toBeGreaterThan(100);
    const hits = files.filter((f) => /lines you will not cross/i.test(fs.readFileSync(f, 'utf8')));
    expect(hits).toEqual([]);
  });
});
