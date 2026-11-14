/**
 * 06.2 D-01 / D-19 guard: calm and confident. Nothing in the app loops, bounces, springs or throws confetti.
 * Walks every .ts/.tsx under src (tests excluded) and fails on, outside comments and strings:
 *   withRepeat(  withSpring(  Easing.bounce  Easing.elastic  loop={true}  a bare `loop` JSX prop  any `confetti` name
 * A line may opt out only with a trailing `// calm-motion-ok: <reason>` comment (none today).
 */
import fs from 'fs';
import path from 'path';

const SRC = path.resolve(__dirname, '..', '..');
const ALLOW = /\/\/\s*calm-motion-ok:\s*\S/;

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

/** Blanks comments and string/template literal contents, keeping line breaks so line numbers hold. */
function stripCommentsAndStrings(source: string): string {
  let out = '';
  let i = 0;
  const n = source.length;
  const blank = (s: string): string => s.replace(/[^\n]/g, ' ');
  while (i < n) {
    const c = source[i]!;
    const next = source[i + 1];
    if (c === '/' && next === '/') {
      const end = source.indexOf('\n', i);
      const stop = end === -1 ? n : end;
      out += blank(source.slice(i, stop));
      i = stop;
    } else if (c === '/' && next === '*') {
      const end = source.indexOf('*/', i + 2);
      const stop = end === -1 ? n : end + 2;
      out += blank(source.slice(i, stop));
      i = stop;
    } else if (c === '"' || c === "'" || c === '`') {
      let j = i + 1;
      while (j < n && source[j] !== c) {
        if (source[j] === '\\') j += 1;
        else if (c !== '`' && source[j] === '\n') break;
        j += 1;
      }
      out += c + blank(source.slice(i + 1, j)) + (j < n ? c : '');
      i = j + 1;
    } else {
      out += c;
      i += 1;
    }
  }
  return out;
}

const RULES: { name: string; re: RegExp }[] = [
  { name: 'withRepeat(', re: /\bwithRepeat\s*\(/ },
  { name: 'withSpring(', re: /\bwithSpring\s*\(/ },
  { name: 'Easing.bounce', re: /\bEasing\s*\.\s*bounce\b/ },
  { name: 'Easing.elastic', re: /\bEasing\s*\.\s*elastic\b/ },
  { name: 'loop={true}', re: /\sloop\s*=\s*\{\s*true\s*\}/ },
  // a bare JSX boolean prop: `loop` followed by the tag end or another prop
  { name: 'bare loop prop', re: /\sloop(?=\s*(?:\/?>|[A-Za-z_]\w*\s*=|$))/ },
  { name: 'confetti', re: /confetti/i },
];

function offenders(file: string, source: string): string[] {
  const stripped = stripCommentsAndStrings(source).split('\n');
  const raw = source.split('\n');
  const found: string[] = [];
  stripped.forEach((line, idx) => {
    if (ALLOW.test(raw[idx] ?? '')) return;
    for (const rule of RULES) {
      if (rule.re.test(line)) found.push(`${path.relative(SRC, file)}:${idx + 1} ${rule.name}`);
    }
  });
  return found;
}

describe('calm motion guard (D-01, D-19)', () => {
  it('no file under src loops, bounces, springs or throws confetti', () => {
    const files = walk(SRC);
    expect(files.length).toBeGreaterThan(50);
    const found = files.flatMap((f) => offenders(f, fs.readFileSync(f, 'utf8')));
    expect(found).toEqual([]);
  });

  it('catches each pattern and ignores comments, strings and loop={false}', () => {
    const bad = [
      'x = withRepeat(withTiming(1), -1);',
      'x = withSpring(1);',
      'const e = Easing.bounce;',
      'const e = Easing.elastic(1);',
      '<LottieView loop={true} />',
      '<LottieView source={a} loop />',
      '<LottieView loop',
      'const confettiBurst = 1;',
    ];
    for (const line of bad) expect(offenders('x.tsx', line)).toHaveLength(1);
    const good = [
      '<LottieView loop={false} />',
      '// withSpring( is banned',
      "const s = 'no confetti here';",
      '/* Easing.bounce */',
      'for (const item of loopItems) run(item);',
      'x = withSpring(1); // calm-motion-ok: test of the allow-list',
    ];
    for (const line of good) expect(offenders('x.tsx', line)).toEqual([]);
  });
});
