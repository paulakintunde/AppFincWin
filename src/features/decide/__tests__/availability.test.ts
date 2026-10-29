import * as fs from 'fs';
import * as path from 'path';

import { DECIDE_OPEN, DECIDE_V3, decideEngine } from '../availability';

const ROOT = path.join(__dirname, '..', '..', '..', '..');

function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

function walk(dir: string, out: string[]): void {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '__tests__') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
  }
}

describe('Decide availability switches', () => {
  it('D-15 the switch is off', () => {
    expect(DECIDE_V3).toBe(false);
    expect(decideEngine()).toBe('v2');
  });

  it('D-15 one reader: only availability.ts mentions DECIDE_V3, exactly twice', () => {
    const files: string[] = [];
    walk(path.join(ROOT, 'src'), files);
    walk(path.join(ROOT, 'app'), files);
    const hits = files.filter((f) =>
      /\bDECIDE_V3\b/.test(stripComments(fs.readFileSync(f, 'utf8'))),
    );
    expect(hits.map((f) => path.relative(ROOT, f).split(path.sep).join('/'))).toEqual([
      'src/features/decide/availability.ts',
    ]);
    const own = stripComments(fs.readFileSync(hits[0]!, 'utf8'));
    expect(own.match(/\bDECIDE_V3\b/g)).toHaveLength(2);
  });

  it('05.2 D-02 the per-account flag selects v3', () => {
    expect(decideEngine({})).toBe('v2');
    expect(decideEngine({ decideV3: false })).toBe('v2');
    expect(decideEngine({ decideV3: true })).toBe('v3');
  });

  it('DECIDE_OPEN unchanged', () => {
    expect(DECIDE_OPEN).toBe(false);
  });
});
