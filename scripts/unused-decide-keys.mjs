#!/usr/bin/env node
// 06.1-37 (D-05): list decide.* copy keys (outside decide.v3 and decide.screens) that no code in src or app refers to.
//   node scripts/unused-decide-keys.mjs
// A key counts as used when a non-test, non-catalogue file holds its full dotted path, or a quoted/template prefix that
// the key sits under (a key built at run time), or when the file builds it from a parent path plus a bare leaf name.
// Prefix-built keys are printed as "check by hand". Exits 1 when an unused key is found. Never lists decide.v3,
// decide.screens or legal.* keys.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const cache = new Map();
const nodeRequire = createRequire(import.meta.url);

function loadTs(file) {
  if (cache.has(file)) return cache.get(file).exports;
  const out = ts.transpileModule(readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText;
  const mod = { exports: {} };
  cache.set(file, mod);
  const req = (spec) => {
    if (spec.startsWith('.')) {
      const base = resolve(dirname(file), spec);
      for (const c of [`${base}.ts`, `${base}.tsx`, join(base, 'index.ts')]) {
        try {
          statSync(c);
          return loadTs(c);
        } catch {
          /* next */
        }
      }
    }
    return nodeRequire(spec);
  };
  new Function('module', 'exports', 'require', out)(mod, mod.exports, req);
  return mod.exports;
}

const en = loadTs(join(ROOT, 'src/i18n/locales/en.ts')).default;

function leaves(node, prefix, out = []) {
  if (typeof node === 'string') out.push(prefix);
  else if (node && typeof node === 'object') for (const [k, v] of Object.entries(node)) leaves(v, `${prefix}.${k}`, out);
  return out;
}
const keys = Object.entries(en.decide)
  .filter(([k]) => k !== 'v3' && k !== 'screens')
  .flatMap(([k, v]) => leaves(v, `decide.${k}`));

function walk(dir, files = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '__tests__' || name === '.git') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, files);
    else if (/\.(ts|tsx|js|jsx|mjs|json)$/.test(name) && !/\.test\./.test(name) && !p.endsWith(join('i18n', 'locales', 'en.ts'))) files.push(p);
  }
  return files;
}
const text = [...walk(join(ROOT, 'src')), ...walk(join(ROOT, 'app'))].map((f) => readFileSync(f, 'utf8')).join('\n');

// Every `decide.x.y` style string fragment in code: a full key, or a prefix ending in "." (template or concatenation).
const fragments = new Set([...text.matchAll(/decide(?:\.[A-Za-z0-9_]+)+\.?/g)].map((m) => m[0]));
// Parent paths used with a relative leaf name, e.g. t(`${base}.title`) where base = 'decide.setup.debtSheet'.
const used = [];
const byHand = [];
const unused = [];
for (const key of keys) {
  // i18next plural forms (key_one, key_other, ...) are read through the bare key.
  const base = key.replace(/_(zero|one|two|few|many|other)$/, '');
  if (fragments.has(key) || fragments.has(base)) {
    used.push(key);
    continue;
  }
  const parts = key.split('.');
  let prefixHit = null;
  for (let i = 2; i < parts.length; i++) {
    const parent = parts.slice(0, i).join('.');
    if (fragments.has(`${parent}.`) || fragments.has(parent)) prefixHit = parent;
  }
  if (prefixHit) byHand.push(`${key}  (under ${prefixHit})`);
  else unused.push(key);
}
for (const l of byHand) console.log(`check by hand: ${l}`);
for (const k of unused) console.log(`unused: ${k}`);
console.log(`${keys.length} keys checked: ${used.length} used, ${byHand.length} check by hand, ${unused.length} unused`);
process.exit(unused.length ? 1 : 0);
