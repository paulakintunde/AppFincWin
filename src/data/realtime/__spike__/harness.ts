// 08-08 spike harness: two real supabase-js clients against the LOCAL Supabase stack.
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js';

export interface LocalStack {
  url: string;
  anon: string;
  service: string;
}

export function readStack(): LocalStack {
  const raw = execFileSync('npx', ['supabase', 'status', '-o', 'json'], { encoding: 'utf8', shell: true });
  const json = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
  const url = String(json.API_URL ?? 'http://127.0.0.1:54321');
  if (!/^http:\/\/(127\.0\.0\.1|localhost)/.test(url)) throw new Error('spike refuses a non-local stack: ' + url);
  return { url, anon: json.ANON_KEY ?? json.PUBLISHABLE_KEY, service: json.SERVICE_ROLE_KEY ?? json.SECRET_KEY };
}

export interface RowEvent {
  table: string;
  type: string;
  at: number;
  row: Record<string, any>;
}

export interface Member {
  id: string;
  client: SupabaseClient;
  events: RowEvent[];
  channels: RealtimeChannel[];
}

export interface World {
  stack: LocalStack;
  admin: SupabaseClient;
  a: Member;
  b: Member;
  householdId: string;
  accountId: string;
  cleanup: () => Promise<void>;
}

const TABLES = ['transactions', 'accounts', 'household_events'] as const;

export function subscribe(member: Member, householdId: string): Promise<void> {
  const channel = member.client.channel('hh:' + householdId + ':' + randomUUID());
  for (const table of TABLES) {
    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table, filter: 'household_id=eq.' + householdId },
      (payload: any) => member.events.push({ table, type: payload.eventType, at: Date.now(), row: payload.new ?? payload.old ?? {} })
    );
  }
  member.channels.push(channel);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('channel did not reach SUBSCRIBED')), 15000);
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        clearTimeout(timer);
        resolve();
      }
    });
  });
}

export async function waitFor(predicate: () => boolean, ms: number): Promise<boolean> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (predicate()) return true;
    await new Promise((r) => setTimeout(r, 25));
  }
  return predicate();
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function makeMember(stack: LocalStack, admin: SupabaseClient, label: string): Promise<Member> {
  const email = `spike-${label}-${randomUUID().slice(0, 8)}@test.local`;
  const password = 'spike-' + randomUUID();
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error || !created.data.user) throw created.error ?? new Error('createUser failed');
  const client = createClient(stack.url, stack.anon, { auth: { persistSession: false, autoRefreshToken: false } });
  const signed = await client.auth.signInWithPassword({ email, password });
  if (signed.error) throw signed.error;
  return { id: created.data.user.id, client, events: [], channels: [] };
}

/** A and B in A's household with one joint account; B subscribed is left to the test. */
export async function setupWorld(): Promise<World> {
  const stack = readStack();
  const admin = createClient(stack.url, stack.service, { auth: { persistSession: false, autoRefreshToken: false } });
  const a = await makeMember(stack, admin, 'a');
  const b = await makeMember(stack, admin, 'b');
  const hh = await admin.from('households').select('id').eq('owner_id', a.id).single();
  if (hh.error) throw hh.error;
  const householdId = hh.data.id as string;
  const join = await admin.from('household_members').insert({ household_id: householdId, user_id: b.id, is_owner: false, weight: 0 });
  if (join.error) throw join.error;
  const accountId = randomUUID();
  const acc = await admin
    .from('accounts')
    .insert({ id: accountId, household_id: householdId, name: 'Spike joint', kind: 'cash', currency: 'USD', opening_balance: 0, is_shared: true });
  if (acc.error) throw acc.error;
  // a token minted before the join carries no household claim, but RLS reads membership live; refresh anyway
  await b.client.auth.refreshSession();
  const cleanup = async () => {
    for (const m of [a, b]) {
      await m.client.removeAllChannels();
      await admin.auth.admin.deleteUser(m.id);
    }
  };
  return { stack, admin, a, b, householdId, accountId, cleanup };
}

/** Inserts a line by service role (the sharing RPCs arrive in plan 08-10). */
export async function insertLine(
  w: World,
  opts: { shared: boolean; createdBy?: string; paidBy?: string | null; note?: string }
): Promise<string> {
  const id = randomUUID();
  const r = await w.admin.from('transactions').insert({
    id,
    household_id: w.householdId,
    account_id: w.accountId,
    created_by: opts.createdBy ?? w.a.id,
    original_amount: -1234,
    original_currency: 'USD',
    local_date: '2026-11-15',
    time_zone: 'UTC',
    note: opts.note ?? 'spike',
    is_shared: opts.shared,
    paid_by: opts.paidBy ?? null,
  });
  if (r.error) throw r.error;
  return id;
}
