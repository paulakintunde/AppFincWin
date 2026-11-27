// Delivery passes for alerts (10-23, ALR-03/04/06, D-11/D-12/D-32). Pure logic with injected I/O so the whole flow runs on fakes.
import type { ExpoMessage, ExpoReceipt, ExpoTicket } from './expo.ts';
import { inQuietHours, isDigestWindow, localParts, quietEndsAt } from './schedule.ts';
import { digestText, pushText } from './text.ts';

export const BATCH_SIZE = 100; // Expo allows at most 100 messages per request
export const CLAIM_LIMIT = 500;
export const MAX_ATTEMPTS = 3;
const RECEIPT_BATCH = 300;
const RETRY_MINUTES = 2;

export type Prefs = {
  mode: 'instant' | 'digest';
  quiet_enabled: boolean;
  quiet_start: string;
  quiet_end: string;
  time_zone: string;
  last_digest_date: string | null;
};
export type ClaimedRow = {
  id: string;
  user_id: string;
  log_id: string;
  kind: string;
  params: Record<string, unknown>;
  attempts: number;
  prefs: Prefs;
  tokens: string[];
};
export type DigestUser = {
  user_id: string;
  prefs: Pick<Prefs, 'time_zone' | 'last_digest_date'>;
  tokens: string[];
  counts: Record<string, number>;
};
export type ReceiptRow = { id: string; ticket_ids: string[]; ticket_tokens: string[] };

export type DeliverDeps = {
  claim(limit: number): Promise<ClaimedRow[]>;
  finish(id: string, status: 'sent' | 'digest' | 'dropped', delivery: 'sent' | 'digest' | 'no_device' | 'failed' | null, ticketIds: string[], ticketTokens: string[]): Promise<void>;
  hold(id: string, until: Date): Promise<void>;
  requeue(id: string, after: Date): Promise<void>;
  digestUsers(): Promise<DigestUser[]>;
  // 10-review S-1: takes today's digest for this person before anything is sent (last_digest_date written atomically).
  // False means another run already took it, so this run sends nothing to them.
  digestClaim(userId: string, localDate: string): Promise<boolean>;
  // Gives the day back after a failure that may pass, so the next minute can try again.
  digestRelease(userId: string, localDate: string, previous: string | null): Promise<void>;
  digestDone(userId: string, localDate: string): Promise<void>;
  receiptsDue(): Promise<ReceiptRow[]>;
  receiptsDone(id: string): Promise<void>;
  dropToken(token: string): Promise<void>;
  send(messages: ExpoMessage[]): Promise<ExpoTicket[]>;
  getReceipts(ids: string[]): Promise<Record<string, ExpoReceipt>>;
  log(entry: Record<string, unknown>): void;
};

export type DeliverCounts = {
  claimed: number;
  sent: number;
  held: number;
  digested: number;
  noDevice: number;
  failed: number;
  requeued: number;
  tokensDropped: number;
  digestsSent: number;
  // Bookkeeping calls that failed. Each failure is logged and skipped, so one cannot stop the rest of the pass.
  errors: number;
};

// 10-review S-1: every per-row write after a send runs on its own. A throw is logged (no ids, no text) and counted, and the
// pass carries on, so the rows already sent are still finished and are not left in 'sending' to be sent again.
async function step(deps: DeliverDeps, counts: { errors: number }, what: string, fn: () => Promise<void>): Promise<boolean> {
  try {
    await fn();
    return true;
  } catch (e) {
    counts.errors++;
    deps.log({ event: 'bookkeeping_failed', step: what, error: e instanceof Error ? e.message : 'error' });
    return false;
  }
}

const chunk = <T>(a: T[], n: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < a.length; i += n) out.push(a.slice(i, i + n));
  return out;
};

const errorOf = (t: ExpoTicket | ExpoReceipt): string | null => (t.status === 'error' ? t.details?.error ?? t.message ?? 'error' : null);

// A bad stored zone must not stop delivery for everyone else.
function safeZone(tz: string): string {
  try {
    localParts(new Date(0), tz);
    return tz;
  } catch {
    return 'UTC';
  }
}

type Outcome = { ticket: ExpoTicket } | { failed: true };

// Sends in batches of BATCH_SIZE. A thrown batch marks only its own messages failed.
async function sendAll(deps: DeliverDeps, messages: ExpoMessage[]): Promise<Outcome[]> {
  const out: Outcome[] = [];
  for (const batch of chunk(messages, BATCH_SIZE)) {
    try {
      const tickets = await deps.send(batch);
      for (const t of tickets) out.push({ ticket: t });
    } catch (e) {
      deps.log({ event: 'send_failed', size: batch.length, error: e instanceof Error ? e.message : 'send' });
      for (let i = 0; i < batch.length; i++) out.push({ failed: true });
    }
  }
  return out;
}

export async function deliverPass(deps: DeliverDeps, now: Date): Promise<DeliverCounts> {
  const counts: DeliverCounts = { claimed: 0, sent: 0, held: 0, digested: 0, noDevice: 0, failed: 0, requeued: 0, tokensDropped: 0, digestsSent: 0, errors: 0 };
  const rows = await deps.claim(CLAIM_LIMIT);
  counts.claimed = rows.length;

  const toSend: { row: ClaimedRow; token: string; message: ExpoMessage }[] = [];
  for (const row of rows) {
    const tz = safeZone(row.prefs.time_zone);
    if (row.prefs.mode === 'digest') {
      if (await step(deps, counts, 'finish', () => deps.finish(row.id, 'digest', null, [], []))) counts.digested++;
      continue;
    }
    if (inQuietHours(now, tz, row.prefs.quiet_enabled, row.prefs.quiet_start, row.prefs.quiet_end)) {
      if (await step(deps, counts, 'hold', () => deps.hold(row.id, quietEndsAt(now, tz, row.prefs.quiet_end)))) counts.held++;
      continue;
    }
    if (row.tokens.length === 0) {
      if (await step(deps, counts, 'finish', () => deps.finish(row.id, 'dropped', 'no_device', [], []))) counts.noDevice++;
      continue;
    }
    const body = pushText(row.kind, row.params);
    for (const token of row.tokens) {
      // data carries the kind and the log id only: never an amount or a name.
      toSend.push({ row, token, message: { to: token, title: 'FincWin', body, channelId: 'alerts', ttl: 86400, data: { kind: row.kind, logId: row.log_id } } });
    }
  }

  const outcomes = await sendAll(deps, toSend.map((s) => s.message));
  const byRow = new Map<string, { row: ClaimedRow; okIds: string[]; okTokens: string[]; dead: number; transient: number; total: number }>();
  const dropped = new Set<string>();
  toSend.forEach((s, i) => {
    const e = byRow.get(s.row.id) ?? { row: s.row, okIds: [], okTokens: [], dead: 0, transient: 0, total: 0 };
    byRow.set(s.row.id, e);
    e.total++;
    const o = outcomes[i];
    if ('failed' in o) e.transient++;
    else if (o.ticket.status === 'ok') {
      e.okIds.push(o.ticket.id);
      e.okTokens.push(s.token);
    } else if (errorOf(o.ticket) === 'DeviceNotRegistered') {
      e.dead++;
      dropped.add(s.token);
    } else e.transient++;
  });

  // Rows first: once a message has gone out, recording that matters more than tidying tokens.
  for (const e of byRow.values()) {
    if (e.okIds.length > 0) {
      if (await step(deps, counts, 'finish', () => deps.finish(e.row.id, 'sent', 'sent', e.okIds, e.okTokens))) counts.sent++;
    } else if (e.transient === 0) {
      // Every token was dead: the log still says why nothing arrived.
      if (await step(deps, counts, 'finish', () => deps.finish(e.row.id, 'dropped', 'no_device', [], []))) counts.noDevice++;
    } else if (e.row.attempts >= MAX_ATTEMPTS) {
      if (await step(deps, counts, 'finish', () => deps.finish(e.row.id, 'dropped', 'failed', [], []))) counts.failed++;
    } else {
      const after = new Date(now.getTime() + e.row.attempts * RETRY_MINUTES * 60000);
      if (await step(deps, counts, 'requeue', () => deps.requeue(e.row.id, after))) counts.requeued++;
    }
  }
  for (const token of dropped) {
    if (await step(deps, counts, 'drop_token', () => deps.dropToken(token))) counts.tokensDropped++;
  }

  try {
    counts.digestsSent = await digestPass(deps, now, counts);
  } catch (e) {
    counts.errors++;
    deps.log({ event: 'digest_pass_failed', error: e instanceof Error ? e.message : 'error' });
  }
  return counts;
}

// One summary per person per day at 08:00 local (D-11). Users outside the window are left alone.
// 10-review S-1: each person's day is claimed in the database before sending, so two overlapping minute runs cannot both send it.
async function digestPass(deps: DeliverDeps, now: Date, counts: { errors: number }): Promise<number> {
  const users = (await deps.digestUsers()).filter((u) => isDigestWindow(now, safeZone(u.prefs.time_zone), u.prefs.last_digest_date));
  const toSend: { user: DigestUser; token: string; message: ExpoMessage }[] = [];
  const done: DigestUser[] = [];
  const dayOf = (u: DigestUser) => localParts(now, safeZone(u.prefs.time_zone)).date;
  for (const u of users) {
    let mine = false;
    if (!(await step(deps, counts, 'digest_claim', async () => void (mine = await deps.digestClaim(u.user_id, dayOf(u)))))) continue;
    if (!mine) continue;
    if (u.tokens.length === 0) {
      done.push(u);
      continue;
    }
    const body = digestText(u.counts);
    for (const token of u.tokens) toSend.push({ user: u, token, message: { to: token, title: 'FincWin', body, channelId: 'digest', ttl: 86400, data: { kind: 'digest' } } });
  }
  const outcomes = await sendAll(deps, toSend.map((s) => s.message));
  const state = new Map<string, { user: DigestUser; ok: boolean; transient: boolean }>();
  const dead = new Set<string>();
  for (let i = 0; i < toSend.length; i++) {
    const s = toSend[i];
    const e = state.get(s.user.user_id) ?? { user: s.user, ok: false, transient: false };
    state.set(s.user.user_id, e);
    const o = outcomes[i];
    if ('failed' in o) e.transient = true;
    else if (o.ticket.status === 'ok') e.ok = true;
    else if (errorOf(o.ticket) === 'DeviceNotRegistered') dead.add(s.token);
    else e.transient = true;
  }
  let sent = 0;
  for (const e of state.values()) {
    if (e.ok || !e.transient) {
      done.push(e.user);
      if (e.ok) sent++;
    } else {
      // Nothing arrived and a failure may pass: give the day back so the next minute (still inside the window) retries.
      await step(deps, counts, 'digest_release', () => deps.digestRelease(e.user.user_id, dayOf(e.user), e.user.prefs.last_digest_date));
    }
  }
  for (const u of done) await step(deps, counts, 'digest_done', () => deps.digestDone(u.user_id, dayOf(u)));
  for (const t of dead) await step(deps, counts, 'drop_token', () => deps.dropToken(t));
  return sent;
}

// About 15 minutes after sending, Expo has receipts. DeviceNotRegistered there means the phone is gone: drop its token.
export async function receiptsPass(deps: DeliverDeps, _now: Date): Promise<{ checked: number; tokensDropped: number }> {
  const rows = await deps.receiptsDue();
  const ids = rows.flatMap((r) => r.ticket_ids);
  const receipts: Record<string, ExpoReceipt> = {};
  for (const batch of chunk(ids, RECEIPT_BATCH)) {
    try {
      Object.assign(receipts, await deps.getReceipts(batch));
    } catch (e) {
      deps.log({ event: 'receipts_failed', error: e instanceof Error ? e.message : 'receipts' });
    }
  }
  const counts = { errors: 0 };
  let checked = 0;
  const dead = new Set<string>();
  for (const r of rows) {
    let complete = true;
    r.ticket_ids.forEach((tid, i) => {
      const rc = receipts[tid];
      if (!rc) complete = false;
      else if (errorOf(rc) === 'DeviceNotRegistered' && r.ticket_tokens[i]) dead.add(r.ticket_tokens[i]);
    });
    if (complete && (await step(deps, counts, 'receipts_done', () => deps.receiptsDone(r.id)))) checked++;
  }
  let dropped = 0;
  for (const t of dead) if (await step(deps, counts, 'drop_token', () => deps.dropToken(t))) dropped++;
  return { checked, tokensDropped: dropped };
}
