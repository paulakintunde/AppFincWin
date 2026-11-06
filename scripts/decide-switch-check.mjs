#!/usr/bin/env node
// 05.4-32 (D-29, D-30, D-34): who may have Decide v3 or shadow runs on.
//   --static  (default) both list files parse, ids are UUIDs, no duplicates, no overlap, roles valid.
//   --online  read-only production query; fails if any account outside the tester list, or any never-on
//             account, has decide_v3 or decide_shadow on. Fails closed when the secrets are missing
//             unless --allow-missing-secret is passed (PR use).
// Output goes to a CI log: counts and the first 8 characters of ids only. Never the token.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ROLES = ['owner', 'tester'];

export function loadFiles(root = ROOT) {
  return {
    testers: readFileSync(join(root, 'docs/ops/decide-testers.json'), 'utf8'),
    neverOn: readFileSync(join(root, 'docs/ops/decide-never-on.json'), 'utf8'),
  };
}

const short = (id) => String(id).slice(0, 8);

function parseList(name, text, errors, needRole) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    errors.push(`${name}: not valid JSON`);
    return [];
  }
  if (!data || !Array.isArray(data.accounts)) {
    errors.push(`${name}: "accounts" must be an array`);
    return [];
  }
  const seen = new Set();
  const ids = [];
  data.accounts.forEach((a, i) => {
    const id = a && typeof a.id === 'string' ? a.id.toLowerCase() : '';
    if (!UUID.test(id)) {
      errors.push(`${name}: entry ${i} id is not a UUID`);
      return;
    }
    if (seen.has(id)) errors.push(`${name}: duplicate id ${short(id)}`);
    seen.add(id);
    if (needRole && !ROLES.includes(a.role)) errors.push(`${name}: entry ${i} (${short(id)}) role must be owner or tester`);
    ids.push(id);
  });
  return ids;
}

export function runStatic(files) {
  const errors = [];
  const testers = parseList('decide-testers.json', files.testers, errors, true);
  const never = parseList('decide-never-on.json', files.neverOn, errors, false);
  for (const id of testers) if (never.includes(id)) errors.push(`overlap: ${short(id)} is on both lists`);
  return { ok: errors.length === 0, errors, testers, never };
}

export async function runOnline({ fetch: doFetch, env, files, allowMissingSecret = false }) {
  const token = env.SUPABASE_READONLY_TOKEN;
  const ref = env.SUPABASE_PROD_PROJECT_REF;
  if (!token || !ref) {
    if (allowMissingSecret) {
      return { ok: true, lines: ['notice: release-gate secrets not available here; online check skipped.'] };
    }
    return { ok: false, lines: ['fail closed: SUPABASE_READONLY_TOKEN or SUPABASE_PROD_PROJECT_REF is missing.'] };
  }
  const st = runStatic(files);
  if (!st.ok) return { ok: false, lines: st.errors };

  const res = await doFetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: 'select id, decide_v3, decide_shadow from public.profiles where decide_v3 or decide_shadow',
      read_only: true,
    }),
  });
  if (!res.ok) return { ok: false, lines: [`query failed with HTTP ${res.status}`] };
  const rows = await res.json();
  if (!Array.isArray(rows)) return { ok: false, lines: ['query returned an unexpected shape'] };

  const outsiders = [];
  const forbidden = [];
  for (const r of rows) {
    const id = String(r.id).toLowerCase();
    if (st.never.includes(id)) forbidden.push(id);
    else if (!st.testers.includes(id)) outsiders.push(id);
  }
  const lines = [
    `accounts with a switch on: ${rows.length}`,
    `outside the tester list: ${outsiders.length}${outsiders.length ? ` (${outsiders.map(short).join(', ')})` : ''}`,
    `never-on accounts with a switch on: ${forbidden.length}${forbidden.length ? ` (${forbidden.map(short).join(', ')})` : ''}`,
  ];
  return { ok: outsiders.length === 0 && forbidden.length === 0, lines };
}

async function main() {
  const args = process.argv.slice(2);
  const files = loadFiles();
  if (args.includes('--online')) {
    const r = await runOnline({
      fetch: globalThis.fetch,
      env: process.env,
      files,
      allowMissingSecret: args.includes('--allow-missing-secret'),
    });
    for (const l of r.lines) console.log(l);
    process.exit(r.ok ? 0 : 1);
  }
  const r = runStatic(files);
  if (!r.ok) {
    for (const e of r.errors) console.error(e);
    process.exit(1);
  }
  console.log(`decide switch lists ok: ${r.testers.length} testers, ${r.never.length} never-on`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch(() => {
    console.error('decide-switch-check failed unexpectedly');
    process.exit(1);
  });
}
