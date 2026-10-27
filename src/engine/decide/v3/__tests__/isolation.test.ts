import * as fs from 'fs';
import * as path from 'path';

const V3_ROOT = path.join(__dirname, '..');
const ENGINE_ROOT = path.join(__dirname, '..', '..', '..');

// Comments may name the helpers they avoid; only code can reach them.
const stripComments = (text: string): string => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '__tests__') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(full));
    else if (entry.name.endsWith('.ts')) out.push(full);
  }
  return out;
}

const norm = (p: string): string => p.split(path.sep).join('/');
/** Path relative to src/engine, forward slashes, without .ts or /index. */
const engineRel = (abs: string): string => norm(path.relative(ENGINE_ROOT, abs)).replace(/\.ts$/, '').replace(/\/index$/, '');

function specifiersOf(file: string): string[] {
  const text = stripComments(fs.readFileSync(file, 'utf8'));
  const out: string[] = [];
  for (const re of [/from\s+['"]([^'"]+)['"]/g, /import\(\s*['"]([^'"]+)['"]\s*\)/g, /^\s*import\s+['"]([^'"]+)['"]/gm]) {
    for (const m of text.matchAll(re)) out.push(m[1]!);
  }
  return out;
}

/** The file a relative specifier points at, or null when it does not exist (yet). */
function resolveFile(fromFile: string, spec: string): string | null {
  const base = path.resolve(path.dirname(fromFile), spec);
  for (const candidate of [`${base}.ts`, path.join(base, 'index.ts'), base]) {
    if (candidate.endsWith('.ts') && fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  return null;
}

const ALLOWED_PREFIXES = ['money/', 'payoff/', 'time/', 'split/', 'guards/'];
const ALLOWED_EXACT = [
  'recurring/schedule',
  'decide/share',
  'decide/cardRule',
  'decide/pots',
  'decide/potTypes',
  'decide/lineDefaults',
  'decide/bisectCore',
];
const RECURRING_ONLY = ['recurring/detect', 'recurring/offer', 'categorize/guessCategory'];
const RECURRING_FILE = 'decide/v3/month/recurring';

function isAllowed(fileRel: string, resolvedRel: string): boolean {
  if (resolvedRel.startsWith('decide/v3/') || resolvedRel === 'decide/v3') return true;
  if (ALLOWED_PREFIXES.some((p) => resolvedRel.startsWith(p))) return true;
  if (ALLOWED_EXACT.includes(resolvedRel)) return true;
  return RECURRING_ONLY.includes(resolvedRel) && fileRel === RECURRING_FILE;
}

/** Files under decide/ outside v3/ that a v3 file may reach. */
const isOldEngineFile = (rel: string): boolean => rel.startsWith('decide/') && !rel.startsWith('decide/v3/') && !ALLOWED_EXACT.includes(rel);

const files = sourceFiles(V3_ROOT);
const cases = files.map((f) => [norm(path.relative(V3_ROOT, f)), f] as const);

describe('v3 isolation (D-16)', () => {
  it('finds at least the barrel', () => {
    expect(files.length).toBeGreaterThan(0);
    expect(cases.map(([n]) => n)).toContain('index.ts');
  });

  it.each(cases)('D-16 leaf-only imports: %s', (_name, file) => {
    const fileRel = engineRel(file);
    const bad: { file: string; spec: string; resolved: string }[] = [];
    for (const spec of specifiersOf(file)) {
      if (!spec.startsWith('.')) {
        bad.push({ file: fileRel, spec, resolved: '(package)' });
        continue;
      }
      const resolved = engineRel(path.resolve(path.dirname(file), spec));
      if (!isAllowed(fileRel, resolved)) bad.push({ file: fileRel, spec, resolved });
    }
    expect(bad).toEqual([]);
  });

  it.each(cases)('D-16 no transitive path to decide/types: %s', (_name, file) => {
    const seen = new Set<string>();
    const bad: { file: string; reached: string; via: string }[] = [];
    const walk = (current: string, via: string): void => {
      if (seen.has(current)) return;
      seen.add(current);
      for (const spec of specifiersOf(current)) {
        if (!spec.startsWith('.')) continue;
        const target = resolveFile(current, spec);
        if (target === null) continue; // not created yet, or a directory-less leaf
        const rel = engineRel(target);
        if (isOldEngineFile(rel)) bad.push({ file: engineRel(file), reached: rel, via: engineRel(current) });
        walk(target, via);
      }
    };
    walk(file, engineRel(file));
    expect(bad).toEqual([]);
  });

  const verdictPath = files.filter((f) => {
    const rel = norm(path.relative(V3_ROOT, f));
    if (rel === 'evaluate.ts') return true;
    if (rel === 'month/recurring.ts') return false;
    return ['judge/', 'funds/', 'plan/', 'cash/', 'month/'].some((d) => rel.startsWith(d));
  });

  it('I34 verdict path never reaches Record detection', () => {
    for (const f of verdictPath) {
      const text = stripComments(fs.readFileSync(f, 'utf8'));
      for (const banned of ['detectRecurring', 'recurring/detect', 'detectCandidates', 'suggestItemType', 'marketDefaults']) {
        expect({ file: norm(path.relative(V3_ROOT, f)), banned, found: text.includes(banned) }).toEqual({
          file: norm(path.relative(V3_ROOT, f)),
          banned,
          found: false,
        });
      }
    }
  });

  it.each(cases)('I16 no clock: %s', (_name, file) => {
    const text = stripComments(fs.readFileSync(file, 'utf8'));
    expect(text).not.toMatch(/new Date\(\s*\)|Date\.now|Math\.random/);
  });
});
