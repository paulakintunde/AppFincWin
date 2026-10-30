/**
 * 05.3-44 (DSV-17/18): every copy key the v3 code can ask for resolves to a string in en.ts.
 * Static scan of 'decide.v3.' literals, prefix constants (const K = 'decide.v3.ui.x.' then `${K}name`), and template keys
 * (checked by prefix, with the unions they iterate expanded below), plus the keys the fact-row model emits for every engine fact code.
 */
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';
import en from '@/i18n/locales/en';
import { FACT_KEYS } from '@/engine/decide/v3/copy/verdictTable';
import { factRows } from '../model/factRows';
import { ITEM_TYPE_ORDER, PURPOSE_ORDER } from '../model/checkOptions';
import { NOT_READY_ORDER, notReadyGroups } from '../model/notReady';
import type { ReadinessItem } from '@/engine/decide/v3';

const SRC = join(__dirname, '..', '..', '..', '..');
const ROOTS = [join(SRC, 'features', 'decide', 'v3'), join(SRC, 'shell', 'decide')];

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === '__tests__') continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

function lookup(key: string): unknown {
  let node: unknown = en;
  for (const part of key.split('.')) {
    if (node === null || typeof node !== 'object') return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return node;
}

const isString = (key: string): boolean => typeof lookup(key) === 'string';
const isSubtree = (key: string): boolean => {
  const n = lookup(key);
  return n !== null && typeof n === 'object';
};

interface Ref {
  key: string;
  at: string;
}

const literals: Ref[] = [];
const templates: Ref[] = [];

for (const file of ROOTS.flatMap(walk)) {
  const rel = relative(SRC, file).split('\\').join('/');
  const text = readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
  const lines = text.split('\n');
  const consts = new Map<string, string>();
  for (const line of lines) {
    const c = /const (\w+) = '(decide\.v3\.[\w.]*)'/.exec(line);
    if (c) consts.set(c[1]!, c[2]!);
  }
  lines.forEach((line, i) => {
    const at = `${rel}:${i + 1}`;
    for (const m of line.matchAll(/['"`](decide\.v3\.[\w.${}]*)['"`]/g)) {
      const key = m[1]!;
      // A bare prefix constant (ends with a dot) is completed elsewhere; the completed keys are scanned below.
      if (key.includes('${')) templates.push({ key, at });
      else if (!key.endsWith('.') && !consts.has(key)) literals.push({ key, at });
    }
    for (const [name, value] of consts) {
      for (const m of line.matchAll(new RegExp(`\\$\\{${name}\\}(\\.?\\w+(?:\\.\\w+)*)`, 'g'))) literals.push({ key: value + m[1]!, at });
      for (const m of line.matchAll(new RegExp(`\\b${name} \\+ '([\\w.]+)'`, 'g'))) literals.push({ key: value + m[1]!, at });
    }
  });
}

describe('v3 copy keys resolve in en.ts', () => {
  it('finds a believable number of keys (the scan is not silently empty)', () => {
    expect(literals.length).toBeGreaterThan(300);
    expect(templates.length).toBeGreaterThan(10);
  });

  it('every literal key (including prefix-constant keys) is a string leaf', () => {
    // i18next plurals: 'x' resolves through x_one / x_other, and a key built as `x_${one|other}` is the stem 'x_'.
    // A key that is a subtree is a stem completed at run time (`${KEY}.title`); its subtree must hold strings (checked below).
    const resolves = (k: string): boolean =>
      isString(k) || isString(`${k}_one`) || isString(`${k}_other`) || (k.endsWith('_') && isString(`${k}one`) && isString(`${k}other`)) || isSubtree(k);
    const bad = literals.filter((r) => !resolves(r.key));
    expect(bad.map((r) => `${r.at} ${r.key}`)).toEqual([]);
  });

  it('every template key has its prefix subtree in en.ts', () => {
    const bad = templates.filter((r) => !isSubtree(r.key.slice(0, r.key.indexOf('${')).replace(/\.$/, '')));
    expect(bad.map((r) => `${r.at} ${r.key}`)).toEqual([]);
  });

  it('expanded unions: purposes, item types and not-ready rows all have copy', () => {
    const keys = [
      ...PURPOSE_ORDER.map((p) => `decide.v3.ui.layers.purpose.${p}`),
      ...ITEM_TYPE_ORDER.map((t) => `decide.v3.ui.check.itemType.${t}`),
      ...NOT_READY_ORDER.map((c) => `decide.v3.ui.notReady.${c}`),
    ];
    expect(keys.filter((k) => !isString(k))).toEqual([]);
  });

  it('notReadyGroups emits only keys that resolve (05.3-57), for every item kind, with and without a pending line', () => {
    const base: ReadinessItem = { kind: 'bill', code: 'past_month_missing', month: '2026-09', seriesId: 's', envelopeId: null, lineId: 'l', name: 'Rent', amount: 100 as never, date: '2026-09-01' };
    const items: ReadinessItem[] = [];
    for (const kind of ['bill', 'pay', 'spending', 'late_start'] as const) {
      for (const month of ['2026-09', '2026-10']) {
        items.push({ ...base, kind, month }, { ...base, kind, month, lineId: null, name: null, date: null }, { ...base, kind, month, lineId: null, name: null });
      }
    }
    const envelope = (name: string | null): ReadinessItem => ({ ...base, kind: 'envelopes', code: 'envelopes_unconfirmed', seriesId: null, envelopeId: 'e', lineId: null, amount: null, date: null, name });
    const runs = [
      notReadyGroups({ ready: false, missing: ['past_month_missing'], items: [...items, envelope('Car')] }, '2026-10', '2026-10-30'),
      notReadyGroups({ ready: false, missing: ['envelopes_unconfirmed'], items: ['A', 'B', 'C', 'D'].map(envelope) }, '2026-10', '2026-10-30'),
      notReadyGroups({ ready: false, missing: ['envelopes_unconfirmed'], items: [envelope(null)] }, '2026-10', '2026-10-30'),
      notReadyGroups({ ready: false, missing: [...NOT_READY_ORDER] }, '2026-10', '2026-10-30'),
    ];
    const emitted = new Set<string>(['decide.v3.ui.notReady.itemA11y']);
    for (const g of runs.flat()) {
      emitted.add(g.headingKey);
      if (g.monthLink) emitted.add(g.monthLink.labelKey);
      for (const v of g.items) {
        emitted.add(v.titleKey);
        emitted.add(v.statusKey);
        if (v.questionKey) emitted.add(v.questionKey);
        if (v.link) emitted.add(v.link.labelKey);
        for (const c of v.chips) emitted.add(c.labelKey);
      }
    }
    expect(emitted.size).toBeGreaterThan(35);
    expect([...emitted].filter((k) => !isString(k))).toEqual([]);
  });

  it('fact rows emit only keys that resolve, for every engine fact code', () => {
    const emitted: string[] = [];
    for (const code of Object.keys(FACT_KEYS)) {
      const values = { month: '2026-10', left: -1, monthly: 1, months: 2, used: 1, after: 1, before: 1, amount: 1, envelopeId: 'e' };
      const rows = factRows({ code: 'fits_month', facts: [{ code, values }], readyBy: null } as never);
      for (const r of rows) emitted.push(r.labelKey, ...(r.subKey ? [r.subKey] : []));
    }
    expect(emitted.length).toBeGreaterThan(5);
    expect(emitted.filter((k) => !isString(k))).toEqual([]);
  });
});
