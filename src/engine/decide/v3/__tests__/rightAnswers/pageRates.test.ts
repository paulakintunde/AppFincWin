/**
 * 05.4-18 audit (D-53): every right-answer page shows each rate as a real percent. Builds all topic pages into a temp folder
 * with scripts/right-answers/build-page.mjs and fails on any percent outside 0-100 (the stored rate is scaled by 10^10).
 */
import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const ROOT = path.join(__dirname, '..', '..', '..', '..', '..', '..');

describe('right-answer pages: rates (D-53)', () => {
  it('shows every percent between 0 and 100', () => {
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'ra-pages-'));
    const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'right-answers', 'build-page.mjs'), '--out', out], { encoding: 'utf8' });
    expect(r.status).toBe(0);
    const files = fs.readdirSync(out).filter((f) => f.endsWith('.html'));
    expect(files.length).toBe(10); // 06-10: the goals topic is the tenth
    let seen = 0;
    for (const f of files) {
      const html = fs.readFileSync(path.join(out, f), 'utf8');
      for (const m of html.matchAll(/(-?\d[\d,]*(?:\.\d+)?)%/g)) {
        const v = Number((m[1] as string).replace(/,/g, ''));
        seen += 1;
        expect({ file: f, v, ok: v >= 0 && v <= 100 }).toEqual({ file: f, v, ok: true });
      }
    }
    expect(seen).toBeGreaterThan(0);
    fs.rmSync(out, { recursive: true, force: true });
  });
});
