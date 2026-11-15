/**
 * 06.2 D-08..D-10 guard: one small size scale.
 *   six spacing steps 4/8/12/16/22/28, two row heights 52/64, two icon tiles 36/48, icon sizes 16/20/24.
 * The old Home tile sizes are gone from layout.ts, the legacy spacing tokens read from the steps,
 * and no style in src/ui or src/features sets a width or height of 32, 34, 38 or 42 (the old tile sizes).
 */
import fs from 'fs';
import path from 'path';

import { iconSize, rowHeight, size, space, step, tile } from '../layout';

const SRC = path.resolve(__dirname, '..', '..');

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

/**
 * Lines allowed to keep an old size, with the reason. Empty today. Format: 'path/from/src.tsx:<text on the line>'.
 */
const ALLOWED: string[] = [];

describe('size scale (06.2 D-08..D-10)', () => {
  it('has exactly the six spacing steps', () => {
    expect(Object.values(step)).toEqual([4, 8, 12, 16, 22, 28]);
  });

  it('has two row heights, two tiles and three icon sizes', () => {
    expect(rowHeight).toEqual({ one: 52, two: 64 });
    expect(tile).toEqual({ row: 36, big: 48 });
    expect(iconSize).toEqual({ inline: 16, row: 20, big: 24 });
  });

  it('legacy spacing tokens read from the steps', () => {
    expect(space.screenH).toBe(step.edge);
    expect(space.cardPad).toBe(step.card);
    expect(space.cardPadLg).toBe(step.card);
    expect(space.gapSm).toBe(step.tight);
    expect(space.gapMd).toBe(step.row);
    expect(space.rowPad).toBe(step.row);
    expect(space.rowPadDense).toBe(step.row);
    expect(space.groupGap).toBe(step.section);
  });

  it('the old Home tile size tokens are gone', () => {
    for (const name of ['homeAccountTile', 'homeQuickCircle', 'homeDateBlock']) {
      expect(Object.keys(size)).not.toContain(name);
    }
  });

  it('no style in src/ui or src/features sets an old tile size (32/34/38/42)', () => {
    const OLD = /\b(?:width|height|minWidth|minHeight)\s*:\s*(?:32|34|38|42)\b/;
    const hits: string[] = [];
    for (const dir of ['ui', 'features']) {
      for (const file of walk(path.join(SRC, dir))) {
        const rel = path.relative(SRC, file).split(path.sep).join('/');
        fs.readFileSync(file, 'utf8')
          .split(/\r?\n/)
          .forEach((line) => {
            if (OLD.test(line) && !ALLOWED.includes(`${rel}:${line.trim()}`)) hits.push(`${rel}: ${line.trim()}`);
          });
      }
    }
    expect(hits).toEqual([]);
  });
});
