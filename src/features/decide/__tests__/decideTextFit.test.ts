/**
 * D-76 static text-fit guards (UI-SPEC R6 "Required layout checks" 1 and 4).
 * Walks src/features/decide/**\/*.tsx (not __tests__), strips comments, and fails on
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

const FILES = walk(ROOT).map((full) => {
  const path = relative(ROOT, full).split('\\').join('/');
  return { path, lines: strip(readFileSync(full, 'utf8')).split('\n') };
});

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
  { path: 'home/ChangesCard.tsx', kind: 'user-name', count: 1, reason: 'user-typed change name' },
  { path: 'home/OpenChecksCard.tsx', kind: 'user-name', count: 1, reason: 'user-typed item name' },
  { path: 'past/PastDecisionsScreen.tsx', kind: 'user-name', count: 1, reason: 'user-typed item name' },
  { path: 'past/DecisionDetailSheet.tsx', kind: 'user-name', count: 1, reason: 'user-typed line name' },
  { path: 'quick/QuickResult.tsx', kind: 'user-name', count: 1, reason: 'user-typed item name (full name in a11y label)' },
  { path: 'ui/LabelValueRow.tsx', kind: 'user-name', count: 1, reason: 'valueLines is passed only for user-typed values' },
  { path: 'check/steps/Step1Item.tsx', kind: 'forwarded', count: 1, reason: 'Chip prop for the user-typed custom type; Chip applies ellipsizeMode tail' },
  { path: 'check/steps/stepUi.tsx', kind: 'input', count: 1, reason: 'TextInput line count' },
  { path: 'check/sections/LedgersSection.tsx', kind: 'figure', count: 1, reason: 'rule N Now/After value' },
  { path: 'check/steps/Step2PriceAndPay.tsx', kind: 'figure', count: 2, reason: 'rule N Final price and committed figure' },
  { path: 'quick/QuickResult.tsx', kind: 'figure', count: 1, reason: 'rule N quick-check monthly figure' },
  { path: 'ui/FigureStrip.tsx', kind: 'figure', count: 1, reason: 'rule N strip figures' },
];


const GEOMETRY_HEIGHT: { path: string; count: number; reason: string }[] = [
  { path: 'charts/CashPathChart.tsx', count: 2, reason: 'chart drawing' },
  { path: 'charts/NetWorthChart.tsx', count: 2, reason: 'chart drawing' },
  { path: 'check/sections/sectionUi.tsx', count: 1, reason: '6px dot' },
  { path: 'check/sections/SetbacksSection.tsx', count: 2, reason: 'checkbox glyph and 44 remove target (no text)' },
  { path: 'check/SplitOverrideSheet.tsx', count: 1, reason: 'radio dot' },
  { path: 'check/steps/step2/AmountRow.tsx', count: 3, reason: 'R16.3 remove target (44) and its dash glyph (no text)' },
  { path: 'check/steps/step2/CardMinimumSheet.tsx', count: 1, reason: 'chevron glyph' },
  { path: 'check/steps/step2/MethodPanels.tsx', count: 1, reason: 'stepper button target (glyph only)' },
  { path: 'home/AddChangeRow.tsx', count: 2, reason: 'plus glyph bars' },
  { path: 'quick/QuickCheckForm.tsx', count: 2, reason: 'loading skeleton bar and the 1px result rule (no text)' },
  { path: 'ui/CheckRow.tsx', count: 4, reason: 'checkbox and remove glyphs (no text)' },
  { path: 'ui/CollapsibleSection.tsx', count: 1, reason: 'chevron glyph' },
  { path: 'ui/CombineToggle.tsx', count: 1, reason: 'dot glyph' },
  { path: 'ui/FoldHint.tsx', count: 1, reason: 'chevron glyph' },
  { path: 'ui/GoalProgress.tsx', count: 2, reason: 'progress bar track and fill' },
  { path: 'ui/InfoButton.tsx', count: 1, reason: 'info glyph target (no text run)' },
  { path: 'ui/StepBar.tsx', count: 1, reason: 'step segments' },
  { path: 'ui/StepSlider.tsx', count: 4, reason: 'slider track and thumb' },
];

const OVERLAY_ABSOLUTE: { path: string; count: number; reason: string }[] = [
  { path: 'charts/CashPathChart.tsx', count: 1, reason: 'chart axis labels, clamped to plot' },
  { path: 'charts/NetWorthChart.tsx', count: 1, reason: 'chart axis labels, clamped to plot' },
  { path: 'home/AddChangeRow.tsx', count: 2, reason: 'plus glyph bars (no text)' },
  { path: 'ui/StepSlider.tsx', count: 1, reason: 'slider thumb' },
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

  it('D-76 rule F: no fixed height on text in Decide', () => {
    expectAllowlist(find(/\b(height|maxHeight)\s*:/), [
      { path: 'charts/CashPathChart.tsx', count: 0, reason: '' },
    ].filter((a) => a.count > 0).concat(GEOMETRY_HEIGHT));
  });

  it('R16 rows and the Amount field are inside the walk, with no line clamp', () => {
    const r16 = [
      'check/steps/step2/AmountRow.tsx',
      'check/steps/step2/UserCostRow.tsx',
      'check/steps/step2/RunningCostPrompts.tsx',
      'check/steps/step2/MethodPanels.tsx',
      'ui/MoneyInput.tsx',
    ];
    const walked = FILES.map((f) => f.path);
    for (const path of r16) expect(walked).toContain(path);
    // rule T: none of them clamps lines; rule O: none positions text absolutely or pulls a margin negative
    const lineHitPaths = new Set(lineHits.map((h) => h.path));
    for (const path of ['check/steps/step2/AmountRow.tsx', 'check/steps/step2/UserCostRow.tsx', 'check/steps/step2/RunningCostPrompts.tsx']) {
      expect(lineHitPaths.has(path)).toBe(false);
    }
  });

  it('D-76 rule O: no absolute text or negative margins outside the overlay allowlist', () => {
    expect(find(/\bmargin[A-Za-z]*\s*:\s*-/).map((h) => `${h.path}:${h.line}`)).toEqual([]);
    expectAllowlist(find(/position\s*:\s*['"]absolute['"]/), OVERLAY_ABSOLUTE);
  });
});
