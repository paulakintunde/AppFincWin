#!/usr/bin/env node
// Phase 10 (10-25, ACC-11, D-26): create the two store-review accounts and reset them to the sample life.
//   node scripts/ops/create-reviewer-accounts.mjs [--dry-run]
// Needs SUPABASE_ACCESS_TOKEN, SUPABASE_PROD_PROJECT_REF, REVIEWER_EMAIL, REVIEWER_PARTNER_EMAIL, REVIEWER_PASSWORD.
// They are read from the main checkout's .env.local (override the path with ENV_FILE), else from the environment.
// Order matters: the allow-list rows go in first, because the before-user-created hook refuses unlisted email sign-ups.
// The service-role key is fetched at run time and kept in memory only. Output is step names, HTTP status codes and masked
// emails. Never the key, the token, the password or a full email.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const REVIEWER_ID = '7e1e7e00-0000-4000-8000-00000000a001';
const PARTNER_ID = '7e1e7e00-0000-4000-8000-00000000a002';
const KEYS = ['SUPABASE_ACCESS_TOKEN', 'SUPABASE_PROD_PROJECT_REF', 'REVIEWER_EMAIL', 'REVIEWER_PARTNER_EMAIL', 'REVIEWER_PASSWORD'];

const dryRun = process.argv.includes('--dry-run');

const mask = (email) => {
  const [local = '', domain = ''] = String(email).split('@');
  return `${local.slice(0, 1)}***@${domain}`;
};

function parseEnv(text) {
  const map = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (value.length >= 2 && ((value[0] === '"' && value.at(-1) === '"') || (value[0] === "'" && value.at(-1) === "'"))) {
      value = value.slice(1, -1);
    }
    map[key] = value;
  }
  return map;
}

function projectId() {
  const toml = readFileSync(join(ROOT, 'supabase/config.toml'), 'utf8');
  const m = /^project_id\s*=\s*"([^"]+)"/m.exec(toml);
  return m ? m[1] : null;
}

const steps = [
  '1 allow-list: upsert both reviewer emails (before any user exists)',
  '2 users: create reviewer and sample partner with fixed ids (already existing is fine)',
  '3 allow-list: link each row to its user id',
  '4 reset: call reset_reviewer_account() once',
];

if (dryRun) {
  console.log('create-reviewer-accounts --dry-run (no network, no secrets read)');
  for (const s of steps) console.log(`  step ${s}`);
  process.exit(0);
}

const envPath = process.env.ENV_FILE ? resolve(process.env.ENV_FILE) : 'C:/dev/fincwin/.env.local';
const fileEnv = existsSync(envPath) ? parseEnv(readFileSync(envPath, 'utf8')) : {};
const env = {};
for (const k of KEYS) env[k] = fileEnv[k] || process.env[k] || '';
const missing = KEYS.filter((k) => !env[k]);
if (missing.length) {
  console.error(`Missing: ${missing.join(', ')}`);
  process.exit(1);
}

const pinned = projectId();
if (!pinned || pinned !== env.SUPABASE_PROD_PROJECT_REF) {
  console.error('Refusing to run: SUPABASE_PROD_PROJECT_REF does not match project_id in supabase/config.toml.');
  process.exit(1);
}

const ref = pinned;
const base = `https://${ref}.supabase.co`;
const people = [
  { id: REVIEWER_ID, email: env.REVIEWER_EMAIL.trim().toLowerCase(), note: 'reviewer' },
  { id: PARTNER_ID, email: env.REVIEWER_PARTNER_EMAIL.trim().toLowerCase(), note: 'reviewer-partner' },
];

async function call(label, url, init) {
  const res = await fetch(url, init);
  console.log(`${label}: HTTP ${res.status}`);
  return res;
}

async function serviceKey() {
  const res = await call('fetch api keys', `https://api.supabase.com/v1/projects/${ref}/api-keys`, {
    headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}` },
  });
  if (!res.ok) throw new Error('could not fetch api keys');
  const list = await res.json();
  const entry = list.find((k) => k.name === 'service_role');
  if (!entry || !entry.api_key) throw new Error('no service_role key found');
  return entry.api_key;
}

async function main() {
  const key = await serviceKey();
  const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };

  const r1 = await call('step 1 allow-list upsert', `${base}/rest/v1/reviewer_allowlist?on_conflict=email`, {
    method: 'POST',
    headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(people.map((p) => ({ email: p.email, note: p.note }))),
  });
  if (!r1.ok) throw new Error('allow-list upsert failed');

  for (const p of people) {
    const r = await call(`step 2 create user ${p.note} (${mask(p.email)})`, `${base}/auth/v1/admin/users`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ id: p.id, email: p.email, password: env.REVIEWER_PASSWORD, email_confirm: true }),
    });
    if (!r.ok && r.status !== 409 && r.status !== 422) throw new Error(`create user failed for ${p.note}`);
  }

  for (const p of people) {
    const r = await call(`step 3 link ${p.note}`, `${base}/rest/v1/reviewer_allowlist?email=eq.${encodeURIComponent(p.email)}`, {
      method: 'PATCH',
      headers: { ...headers, Prefer: 'return=minimal' },
      body: JSON.stringify({ user_id: p.id }),
    });
    if (!r.ok) throw new Error(`link failed for ${p.note}`);
  }

  const r4 = await call('step 4 reset_reviewer_account', `${base}/rest/v1/rpc/reset_reviewer_account`, {
    method: 'POST',
    headers,
    body: '{}',
  });
  if (!r4.ok) throw new Error('reset failed');
  console.log('done');
}

main().catch((e) => {
  console.error(`Failed: ${e.message}`);
  process.exit(1);
});
