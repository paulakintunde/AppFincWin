/**
 * D-76 static text-fit guards (UI-SPEC R6 "Required layout checks" 1 and 4).
 * Walks src/features/decide/**\/*.tsx (not __tests__) plus the shared parts moved to src/ui in 05.4-39, strips comments, and fails on
 * numberOfLines (rules T, N), fixed heights (rule F) and absolute text or negative margins (rule O)
 * outside per-file allowlists with exact counts. A new violation fails with file and line.
 */
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

const ROOT = join(__dirname, '..');

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === '__tests__') continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (name.endsWith('.tsx')) out.push(full);
  }
  return out;
}

/** Remove comments but keep newlines so line numbers survive. */
function strip(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

// 05.4-39 (D-156): the parts that moved from decide/ui to src/ui stay under these guards, listed as '@/ui/<Name>.tsx'.
const SHARED_UI = ['MoneyInput', 'SegmentedToggle', 'StateChip', 'LabelValueRow', 'CheckRow', 'WarningCard', 'WrittenList', 'CustomValueChips'];
const UI_DIR = join(__dirname, '..', '..', '..', 'ui');
// 06.1-41: the account-use sheet, list and suggestions moved to record/accounts and stay under these guards, listed by '@/' path.
const MOVED_TO_RECORD = ['AccountUseSheet', 'AccountUseList'];
const RECORD_ACCOUNTS_DIR = join(__dirname, '..', '..', 'record', 'accounts');

const FILES = [
  ...walk(ROOT).map((full) => ({ path: relative(ROOT, full).split('\\').join('/'), full })),
  ...SHARED_UI.map((name) => ({ path: `@/ui/${name}.tsx`, full: join(UI_DIR, `${name}.tsx`) })),
  ...MOVED_TO_RECORD.map((name) => ({ path: `@/features/record/accounts/${name}.tsx`, full: join(RECORD_ACCOUNTS_DIR, `${name}.tsx`) })),
].map(({ path, full }) => ({ path, lines: strip(readFileSync(full, 'utf8')).split('\n') }));

interface Hit {
  path: string;
  line: number;
  text: string;
}

function find(re: RegExp): Hit[] {
  const hits: Hit[] = [];
  for (const f of FILES) {
    f.lines.forEach((text, i) => {
      if (re.test(text)) hits.push({ path: f.path, line: i + 1, text });
    });
  }
  return hits;
}

/** The occurrence line plus following lines up to the end of its JSX tag (at most 6 lines). */
function windowAt(h: Hit): string {
  const lines = FILES.find((f) => f.path === h.path)!.lines;
  let out = '';
  for (let i = h.line - 1; i < Math.min(lines.length, h.line + 5); i++) {
    out += lines[i] + '\n';
    if (i > h.line - 1 && /(^|[^=])>/.test(lines[i]!)) break;
  }
  return out;
}

function countByFile(hits: Hit[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const h of hits) out[h.path] = (out[h.path] ?? 0) + 1;
  return out;
}

function expectAllowlist(hits: Hit[], allow: { path: string; count: number; reason: string }[]): void {
  const allowed = Object.fromEntries(allow.map((a) => [a.path, a.count]));
  const observed = countByFile(hits);
  const problems: string[] = [];
  for (const [path, n] of Object.entries(observed)) {
    if (allowed[path] !== n) {
      const lines = hits.filter((h) => h.path === path).map((h) => h.line).join(',');
      problems.push(`${path}: found ${n} (lines ${lines}), allowlist ${allowed[path] ?? 0}`);
    }
  }
  for (const a of allow) if (observed[a.path] === undefined) problems.push(`${a.path}: allowlisted ${a.count}, found 0 (stale entry)`);
  expect(problems).toEqual([]);
}

type NumberKind = 'user-name' | 'figure' | 'input' | 'forwarded';
const NUMBER_ALLOW: { path: string; kind: NumberKind; count: number; reason: string }[] = [
  { path: '@/ui/LabelValueRow.tsx', kind: 'user-name', count: 1, reason: 'valueLines is passed only for user-typed values' },
  { path: '@/features/record/accounts/AccountUseList.tsx', kind: 'figure', count: 1, reason: 'rule N setup account balance, shrinks to its line' },
  { path: 'screens/actions/BoughtScreen.tsx', kind: 'user-name', count: 1, reason: 'the item name the user typed, two lines then ellipsis' },
];


const GEOMETRY_HEIGHT: { path: string; count: number; reason: string }[] = [
  { path: 'charts/CashPathChart.tsx', count: 2, reason: 'chart drawing' },
  { path: 'hints/FoldHint.tsx', count: 1, reason: 'chevron glyph' },
  { path: 'charts/NetWorthChart.tsx', count: 2, reason: 'chart drawing' },
  { path: 'screens/sheets/DatePickerSheet.tsx', count: 1, reason: '5px payday dot (no text); day cells use minHeight' },
  { path: 'screens/home/MoreDetails.tsx', count: 1, reason: 'chevron glyph (no text)' },
  { path: 'screens/home/YourMonthCard.tsx', count: 4, reason: 'arrow and records chevron glyphs and the records n-of-3 bar (no text)' },
  { path: 'screens/check/StepFrame.tsx', count: 1, reason: 'back chevron glyph (no text)' },
  { path: 'screens/setup/SetupBanner.tsx', count: 1, reason: 'collapse chevron glyph (no text)' },
  { path: 'screens/setup/SetupChecklist.tsx', count: 1, reason: 'back chevron glyph (no text)' },
  { path: 'screens/setup/items/SetupItemFrame.tsx', count: 1, reason: 'back chevron glyph (no text), 06.1-65 DN-12' },
  { path: '@/ui/CheckRow.tsx', count: 4, reason: 'checkbox and remove glyphs (no text)' },
];

const OVERLAY_ABSOLUTE: { path: string; count: number; reason: string }[] = [
  { path: 'charts/CashPathChart.tsx', count: 1, reason: 'chart axis labels, clamped to plot' },
  { path: 'charts/NetWorthChart.tsx', count: 1, reason: 'chart axis labels, clamped to plot' },
  { path: 'screens/firstAnswer/FirstAnswerGate.tsx', count: 1, reason: '06.1-66 (CN-11): the offline gate view covers the answer frame it sits over; its card text flows normally inside it' },
];

describe('D-76 static text-fit', () => {
  const lineHits = find(/\bnumberOfLines\b/);
  const classify = (h: Hit): NumberKind | 'bare' => {
    const w = windowAt(h);
    if (/adjustsFontSizeToFit/.test(w)) return 'figure';
    if (/ellipsizeMode/.test(w)) return 'user-name';
    return 'bare';
  };

  it('D-76 rule T: no numberOfLines on system copy in Decide', () => {
    const observed: Record<string, number> = {};
    for (const h of lineHits) {
      const c = classify(h);
      // 'bare' occurrences are inputs or props forwarded to a component that sets the ellipsis
      const kind: string = c === 'bare' ? 'bare' : c;
      if (kind === 'figure') continue;
      const key = `${h.path}|${kind === 'bare' ? 'other' : kind}`;
      observed[key] = (observed[key] ?? 0) + 1;
    }
    const allowed: Record<string, number> = {};
    for (const a of NUMBER_ALLOW) {
      if (a.kind === 'figure') continue;
      const key = `${a.path}|${a.kind === 'user-name' ? 'user-name' : 'other'}`;
      allowed[key] = a.count;
    }
    expect(observed).toEqual(allowed);
  });

  it('D-76 rule N: every one-line figure scales to fit', () => {
    const figures: Record<string, number> = {};
    for (const h of lineHits) {
      if (classify(h) !== 'figure') continue;
      expect(windowAt(h)).toMatch(/minimumFontScale/);
      figures[h.path] = (figures[h.path] ?? 0) + 1;
    }
    const allowed: Record<string, number> = {};
    for (const a of NUMBER_ALLOW) if (a.kind === 'figure') allowed[a.path] = a.count;
    expect(figures).toEqual(allowed);
  });

  it('R17 the hero is the only fit below 0.8', () => {
    const below: Record<string, number[]> = {};
    for (const f of FILES) {
      const text = f.lines.join('\n');
      const consts = new Map<string, number>();
      for (const m of text.matchAll(/const\s+(\w+)\s*=\s*(\d*\.?\d+)\s*;/g)) consts.set(m[1] ?? '', Number(m[2]));
      for (const m of text.matchAll(/minimumFontScale\s*[=:]\s*\{?\s*([\w.]+)/g)) {
        const token = m[1] ?? '';
        const value = /^\d*\.?\d+$/.test(token) ? Number(token) : consts.get(token);
        // a value this walk cannot resolve fails loudly rather than slipping under the floor
        expect({ path: f.path, token, resolved: value !== undefined }).toEqual({ path: f.path, token, resolved: true });
        if ((value as number) < 0.8) (below[f.path] ??= []).push(value as number);
      }
    }
    // R17.13 M2 hero-only exception went with the old home card (06.1-36): nothing goes under 0.8
    expect(below).toEqual({});
  });

  it('D-76 rule F: no fixed height on text in Decide', () => {
    expectAllowlist(find(/\b(height|maxHeight)\s*:/), [
      { path: 'charts/CashPathChart.tsx', count: 0, reason: '' },
    ].filter((a) => a.count > 0).concat(GEOMETRY_HEIGHT));
  });

  it('the shared Amount field is inside the walk', () => {
    expect(FILES.map((f) => f.path)).toContain('@/ui/MoneyInput.tsx');
  });

  it('D-76 rule O: no absolute text or negative margins outside the overlay allowlist', () => {
    expect(find(/\bmargin[A-Za-z]*\s*:\s*-/).map((h) => `${h.path}:${h.line}`)).toEqual([]);
    expectAllowlist(find(/position\s*:\s*['"]absolute['"]/), OVERLAY_ABSOLUTE);
  });
});
