// 05.4-43 (D-172): split the D-32 mutation scope into parts with about the same number of mutants.
// Mutants are counted with Stryker's own instrumenter (a few seconds, no tests run). A file bigger than a piece is cut
// into line ranges at lines no mutant straddles: Stryker keeps a mutant only when its whole location is inside a
// `--mutate file:a-b` range, so a cut through a mutant would lose it. Parts are filled largest piece first.
//
//   node scripts/mutation-shards.mjs --parts 20 --out reports/mutation-plan.json
//
// With GITHUB_OUTPUT set it also writes `matrix={"include":[{"part":1,"mutate":"..."},...]}` for a job matrix.
import { appendFileSync, globSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, matchesGlob, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/** Lines L (0-based, 0..lines) where a range may start: no mutant has start < L <= end. */
export function safeCuts(lines, mutants) {
  const unsafe = new Uint8Array(lines + 1);
  for (const { start, end } of mutants) for (let L = start + 1; L <= Math.min(end, lines); L++) unsafe[L] = 1;
  const cuts = [];
  for (let L = 0; L <= lines; L++) if (!unsafe[L]) cuts.push(L);
  return cuts;
}

/** `file:a-b` -> { file, from: a, to: b } (1-based, inclusive); a bare file -> from/to undefined. */
export function rangeOf(entry) {
  const hit = /^(.*):(\d+)-(\d+)$/.exec(entry);
  return hit ? { file: hit[1], from: Number(hit[2]), to: Number(hit[3]) } : { file: entry };
}

/** Whether a mutant ({ start, end }, 0-based lines) is kept by a `--mutate` entry. */
export function inRange(entry, mutant) {
  const r = rangeOf(entry);
  if (r.from === undefined) return true;
  return mutant.start + 1 >= r.from && mutant.end + 1 <= r.to;
}

/** One file -> pieces of at most `size` mutants (a stretch no cut can split may exceed it). */
export function splitFile(file, size) {
  const { name, lines, mutants } = file;
  if (mutants.length <= size) return [{ file: name, mutate: name, count: mutants.length }];
  const perLine = new Map();
  for (const mu of mutants) perLine.set(mu.start, (perLine.get(mu.start) ?? 0) + 1);
  const cuts = safeCuts(lines, mutants);
  const segments = [];
  for (let i = 0; i + 1 < cuts.length; i++) {
    let count = 0;
    for (let L = cuts[i]; L < cuts[i + 1]; L++) count += perLine.get(L) ?? 0;
    segments.push({ from: cuts[i], to: cuts[i + 1], count });
  }
  const pieces = [];
  let open = null;
  for (const seg of segments) {
    if (open && open.count > 0 && open.count + seg.count > size) {
      pieces.push(open);
      open = null;
    }
    open = open ? { ...open, to: seg.to, count: open.count + seg.count } : { ...seg };
  }
  if (open) pieces.push(open);
  pieces[pieces.length - 1].to = lines;
  return pieces.map((p) => ({ file: name, mutate: `${name}:${p.from + 1}-${p.to}`, count: p.count }));
}

/** files: [{ name, lines, mutants: [{ start, end }] }] -> { total, files: { name: count }, parts: [{ part, mutate, count }] } */
export function planParts(files, n) {
  const total = files.reduce((s, f) => s + f.mutants.length, 0);
  // a third of a part, so the largest-first fill can even out; never below 50 (tiny files are not worth a range)
  const size = Math.max(50, Math.ceil(total / n / 3));
  const units = files.flatMap((f) => splitFile(f, size)).filter((u) => u.count > 0);
  return { total, files: Object.fromEntries(files.map((f) => [f.name, f.mutants.length])), parts: pack(units, n) };
}

/**
 * Re-run only some `--mutate` entries (file or file:a-b), cut into n parts. Used to re-run the parts of a full run
 * that did not finish (2026-11-18: 12 of 40 parts hit the 5-hour limit on judge.ts, the month model and the cash path).
 * Each piece stays inside its entry, so no mutant is planned twice against the earlier run's finished parts.
 * `files` counts only the mutants inside the entries, so this plan's own completeness check covers the subset.
 */
export function planOnly(files, entries, n) {
  const byName = new Map(files.map((f) => [f.name, f]));
  const picked = [];
  for (const entry of entries) {
    const r = rangeOf(entry);
    const f = byName.get(r.file);
    if (!f) throw new Error(`--only names a file outside the mutation scope: ${r.file}`);
    const mutants = f.mutants.filter((mu) => inRange(entry, mu));
    if (mutants.length > 0) picked.push({ r, file: { name: f.name, lines: f.lines, mutants } });
  }
  const total = picked.reduce((s, p) => s + p.file.mutants.length, 0);
  // smaller pieces than a full run: the point is to stay well inside the time limit
  const size = Math.max(20, Math.ceil(total / n / 3));
  const clamp = (r, file, piece) => {
    if (r.from === undefined) return piece;
    const p = rangeOf(piece.mutate);
    return { ...piece, mutate: `${file.name}:${Math.max(p.from ?? 1, r.from)}-${Math.min(p.to ?? file.lines, r.to)}` };
  };
  // every mutator but BlockStatement in the whole re-run, so all BlockStatement-only pieces share parts
  const others = [...new Set(picked.flatMap((p) => p.file.mutants.map((mu) => mu.name)))].filter((x) => x && x !== BLOCK).sort().join(',');
  const units = [];
  for (const { r, file } of picked) {
    const pieces = splitFile(file, size).filter((p) => p.count > 0);
    const blocks = file.mutants.filter((mu) => mu.name === BLOCK);
    if (blocks.length > 0 && pieces.some((p) => p.count > 2 * size)) {
      // A function-wide BlockStatement mutant spans the whole stretch, so no line can be cut. Run the stretch twice
      // with disjoint mutators: once without BlockStatement (now cuttable), once with BlockStatement alone.
      const rest = file.mutants.filter((mu) => mu.name !== BLOCK);
      for (const piece of splitFile({ ...file, mutants: rest }, size)) {
        if (piece.count > 0) units.push({ ...clamp(r, file, piece), exclude: BLOCK });
      }
      const whole = r.from === undefined ? file.name : `${file.name}:${r.from}-${r.to}`;
      units.push({ file: file.name, mutate: whole, count: blocks.length, exclude: others });
    } else for (const piece of pieces) units.push(clamp(r, file, piece));
  }
  const counts = {};
  for (const { file } of picked) counts[file.name] = (counts[file.name] ?? 0) + file.mutants.length;
  return { total, files: counts, parts: pack(units, n) };
}

const BLOCK = 'BlockStatement';

/**
 * Fill n parts largest piece first, each piece into the emptiest part. Pieces that leave out different mutators
 * (`exclude`) never share a part: Stryker's excludedMutations applies to the whole part.
 */
function pack(units, n) {
  const groups = new Map();
  for (const u of units) groups.set(u.exclude ?? '', [...(groups.get(u.exclude ?? '') ?? []), u]);
  const total = units.reduce((s, u) => s + u.count, 0);
  const keys = [...groups.keys()].sort();
  const out = [];
  for (const key of keys) {
    const group = groups.get(key);
    const share = group.reduce((s, u) => s + u.count, 0);
    // parts per group in proportion to its mutants, at least one
    const k = Math.max(1, Math.min(group.length, Math.round((n * share) / Math.max(1, total))));
    group.sort((a, b) => b.count - a.count || a.mutate.localeCompare(b.mutate));
    const bins = Array.from({ length: k }, () => ({ count: 0, entries: [] }));
    for (const u of group) {
      const bin = bins.reduce((best, b) => (b.count < best.count ? b : best));
      bin.count += u.count;
      bin.entries.push(u.mutate);
    }
    for (const b of bins) out.push({ mutate: b.entries.sort().join(','), count: b.count, ...(key ? { exclude: key } : {}) });
  }
  return out.map((p, i) => ({ part: i + 1, ...p }));
}

/** Expand Stryker's `mutate` list (globs, `!` exclusions, in order) to file names with forward slashes. */
export function expandMutate(patterns, cwd) {
  let files = [];
  for (const p of patterns) {
    if (p.startsWith('!')) files = files.filter((f) => !matchesGlob(f, p.slice(1)));
    else for (const f of globSync(p, { cwd })) files.push(f.replaceAll('\\', '/'));
  }
  return [...new Set(files)].sort();
}

/** Count each file's mutants with Stryker's instrumenter. */
export async function countMutants(names, cwd, mutatorOptions = {}) {
  const { Instrumenter } = await import('@stryker-mutator/instrumenter');
  const quiet = new Proxy({}, { get: (_, key) => (String(key).startsWith('is') ? () => false : () => {}) });
  const instrumenter = new Instrumenter(quiet);
  const options = { ignorers: [], excludedMutations: [], plugins: null, ...mutatorOptions };
  const out = [];
  for (const name of names) {
    const content = readFileSync(resolve(cwd, name), 'utf8');
    const { mutants } = await instrumenter.instrument([{ name, content, mutate: true }], options);
    out.push({ name, lines: content.split('\n').length, mutants: mutants.map((x) => ({ start: x.location.start.line, end: x.location.end.line, name: x.mutatorName })) });
  }
  return out;
}

async function main(argv) {
  const arg = (flag, fallback) => (argv.includes(flag) ? argv[argv.indexOf(flag) + 1] : fallback);
  const parts = Number(arg('--parts', '20'));
  const outFile = arg('--out', 'reports/mutation-plan.json');
  const cwd = process.cwd();
  const config = (await import(pathToFileURL(resolve(cwd, arg('--config', 'stryker.config.mjs'))).href)).default;
  const only = (arg('--only', '') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const scope = expandMutate(config.mutate, cwd);
  const names = only.length > 0 ? scope.filter((name) => only.some((e) => rangeOf(e).file === name)) : scope;
  const counted = await countMutants(names, cwd, config.mutator ?? {});
  const plan = only.length > 0 ? planOnly(counted, only, parts) : planParts(counted, parts);
  mkdirSync(dirname(resolve(cwd, outFile)), { recursive: true });
  writeFileSync(resolve(cwd, outFile), `${JSON.stringify(plan, null, 2)}\n`);
  const counts = plan.parts.map((p) => p.count);
  console.log(`${names.length} files, ${plan.total} mutants, ${plan.parts.length} parts of ${Math.min(...counts)}..${Math.max(...counts)} mutants`);
  for (const p of plan.parts) console.log(`part ${p.part}: ${p.count} mutants${p.exclude ? ` (without ${p.exclude})` : ''}: ${p.mutate}`);
  if (process.env.GITHUB_OUTPUT) {
    const matrix = { include: plan.parts.map(({ part, mutate, exclude }) => ({ part, mutate, exclude: exclude ?? '' })) };
    appendFileSync(process.env.GITHUB_OUTPUT, `matrix=${JSON.stringify(matrix)}\n`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main(process.argv.slice(2)).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
