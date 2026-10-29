/**
 * 05.3 D-09: no Decide screen blocks screenshots or blurs on background, the same as the rest of the app.
 * Walks src/features/decide/**\/*.{ts,tsx} (not __tests__), strips comments and fails on any capture-block API.
 */
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

const ROOT = join(__dirname, '..');

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === '__tests__' || name === 'node_modules') continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (name.endsWith('.ts') || name.endsWith('.tsx')) out.push(full);
  }
  return out;
}

/** Remove comments but keep newlines so line numbers survive. */
function strip(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const BLOCKERS = /usePreventScreenCapture|preventScreenCaptureAsync|preventScreenCapture|FLAG_SECURE|expo-screen-capture|AppState[\s\S]{0,200}blur/g;

function screenCaptureHits(source: string): string[] {
  return strip(source).match(BLOCKERS) ?? [];
}

describe('D-09 no screenshot block on Decide', () => {
  it('D-09 no Decide screen blocks screenshots', () => {
    const bad: Record<string, string[]> = {};
    for (const full of walk(ROOT)) {
      const hits = screenCaptureHits(readFileSync(full, 'utf8'));
      if (hits.length > 0) bad[relative(ROOT, full).split('\\').join('/')] = hits;
    }
    expect(bad).toEqual({});
  });

  it('the checker catches the capture-block APIs', () => {
    expect(screenCaptureHits('usePreventScreenCapture();')).not.toEqual([]);
    expect(screenCaptureHits("import * as ScreenCapture from 'expo-screen-capture';")).not.toEqual([]);
  });

  it('the checker ignores the same words inside comments', () => {
    expect(screenCaptureHits('// usePreventScreenCapture is not used here\nconst a = 1;')).toEqual([]);
    expect(screenCaptureHits('/* FLAG_SECURE */ const a = 1;')).toEqual([]);
  });
});
