import test from 'node:test';
import assert from 'node:assert/strict';
import { runStatic, runOnline } from '../decide-switch-check.mjs';

const A = 'aaaaaaaa-1111-4111-8111-111111111111';
const B = 'bbbbbbbb-2222-4222-8222-222222222222';
const C = 'cccccccc-3333-4333-8333-333333333333';
const lists = (t, n) => ({
  testers: JSON.stringify({ accounts: t }),
  neverOn: JSON.stringify({ accounts: n }),
});
const ok = lists([{ id: A, role: 'owner' }], [{ id: C }]);
const fetchOf = (rows, status = 200) => async () => ({ ok: status === 200, status, json: async () => rows });
const env = { SUPABASE_READONLY_TOKEN: 'sbp_secrettoken', SUPABASE_PROD_PROJECT_REF: 'ref123' };

test('static passes on valid lists and on empty lists', () => {
  assert.equal(runStatic(ok).ok, true);
  assert.equal(runStatic(lists([], [])).ok, true);
});
test('static fails on bad json, non-uuid, duplicate, overlap, bad role', () => {
  assert.equal(runStatic({ testers: '{', neverOn: '{"accounts":[]}' }).ok, false);
  assert.equal(runStatic(lists([{ id: 'nope', role: 'owner' }], [])).ok, false);
  assert.equal(runStatic(lists([{ id: A, role: 'owner' }, { id: A, role: 'tester' }], [])).ok, false);
  assert.equal(runStatic(lists([{ id: A, role: 'owner' }], [{ id: A }])).ok, false);
  assert.equal(runStatic(lists([{ id: A, role: 'admin' }], [])).ok, false);
});
test('online passes when only testers have a switch on', async () => {
  const r = await runOnline({ fetch: fetchOf([{ id: A }]), env, files: ok });
  assert.equal(r.ok, true);
});
test('online fails on an outsider and prints only 8 chars, never the token', async () => {
  const r = await runOnline({ fetch: fetchOf([{ id: B }]), env, files: ok });
  assert.equal(r.ok, false);
  const out = r.lines.join('\n');
  assert.ok(out.includes('bbbbbbbb'));
  assert.ok(!out.includes(B));
  assert.ok(!out.includes('sbp_secrettoken'));
});
test('online fails on a never-on account', async () => {
  const r = await runOnline({ fetch: fetchOf([{ id: C }]), env, files: ok });
  assert.equal(r.ok, false);
  assert.ok(!r.lines.join('\n').includes(C));
});
test('online sends read_only and bearer header', async () => {
  let seen;
  await runOnline({
    fetch: async (u, o) => {
      seen = o;
      return { ok: true, status: 200, json: async () => [] };
    },
    env,
    files: ok,
  });
  assert.equal(JSON.parse(seen.body).read_only, true);
  assert.equal(seen.headers.Authorization, 'Bearer sbp_secrettoken');
});
test('online fails closed on missing secret, skips with the flag', async () => {
  const r = await runOnline({ fetch: fetchOf([]), env: {}, files: ok });
  assert.equal(r.ok, false);
  const s = await runOnline({ fetch: fetchOf([]), env: {}, files: ok, allowMissingSecret: true });
  assert.equal(s.ok, true);
});
test('online fails on HTTP error', async () => {
  const r = await runOnline({ fetch: fetchOf([], 403), env, files: ok });
  assert.equal(r.ok, false);
});
