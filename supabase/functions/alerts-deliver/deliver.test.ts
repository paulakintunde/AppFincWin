// Runs under Deno (`npm run test:deno`) and under Jest (the default suite): no runner imports.
import { BATCH_SIZE, deliverPass, receiptsPass, type ClaimedRow, type DeliverDeps, type DigestUser, type ReceiptRow } from './deliver.ts';
import { createExpo, SEND_URL, type ExpoMessage, type ExpoReceipt, type ExpoTicket } from './expo.ts';

type Runner = (name: string, fn: () => void | Promise<void>) => void;
const g = globalThis as unknown as { Deno?: { test: Runner }; test?: Runner };
const run: Runner = (name, fn) => (g.Deno ? g.Deno.test(name, fn) : (g.test as Runner)(name, fn));

function assertEquals(actual: unknown, expected: unknown, msg = ''): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${msg} expected ${JSON.stringify(expected)} got ${JSON.stringify(actual)}`);
  }
}

const NOW = new Date('2026-11-22T20:00:00Z'); // 12:00 in Vancouver: outside quiet hours, outside the digest window
const TOK = 'ExponentPushToken[aaaaaaaaaaaaaaaa]';

const row = (id: string, over: Partial<ClaimedRow> = {}): ClaimedRow => ({
  id, user_id: 'u1', log_id: 'log-' + id, kind: 'large_txn', params: { category: 'Shopping', amount_minor: 48000, currency: 'USD' }, attempts: 1,
  prefs: { mode: 'instant', quiet_enabled: true, quiet_start: '22:00:00', quiet_end: '07:00:00', time_zone: 'America/Los_Angeles', last_digest_date: null },
  tokens: [TOK], ...over,
});

function harness(over: Partial<DeliverDeps> & { rows?: ClaimedRow[]; digest?: DigestUser[]; receipts?: ReceiptRow[]; tickets?: (m: ExpoMessage) => ExpoTicket } = {}) {
  const calls: string[] = [];
  const sent: ExpoMessage[][] = [];
  const deps: DeliverDeps = {
    claim: async () => over.rows ?? [],
    finish: over.finish ?? (async (id, status, delivery, ids, toks) => void calls.push(`finish:${id}:${status}:${delivery}:${ids.join('|')}:${toks.join('|')}`)),
    hold: over.hold ?? (async (id, until) => void calls.push(`hold:${id}:${until.toISOString()}`)),
    requeue: async (id, after) => void calls.push(`requeue:${id}:${after.toISOString()}`),
    digestUsers: async () => over.digest ?? [],
    digestClaim: over.digestClaim ?? (async (u, d) => (calls.push(`digestClaim:${u}:${d}`), true)),
    digestRelease: async (u, d, p) => void calls.push(`digestRelease:${u}:${d}:${p}`),
    digestDone: async (u, d) => void calls.push(`digestDone:${u}:${d}`),
    receiptsDue: async () => over.receipts ?? [],
    receiptsDone: over.receiptsDone ?? (async (id) => void calls.push(`receiptsDone:${id}`)),
    dropToken: async (t) => void calls.push(`drop:${t}`),
    send: over.send ?? (async (m) => {
      sent.push(m);
      return m.map((x, i) => (over.tickets ? over.tickets(x) : { status: 'ok', id: `tk-${sent.length}-${i}` } as ExpoTicket));
    }),
    getReceipts: over.getReceipts ?? (async () => ({})),
    log: () => {},
  };
  return { deps, calls, sent };
}

run('an instant alert is sent and logged sent with its ticket', async () => {
  const h = harness({ rows: [row('r1')] });
  const c = await deliverPass(h.deps, NOW);
  assertEquals(c.sent, 1);
  assertEquals(h.calls, [`finish:r1:sent:sent:tk-1-0:${TOK}`]);
  assertEquals(h.sent[0][0].body, 'A $480 expense was added to Shopping.');
  assertEquals(h.sent[0][0].channelId, 'alerts');
  assertEquals(h.sent[0][0].title, 'FincWin');
});

run('message data carries only kind and log id', async () => {
  const h = harness({ rows: [row('r1')] });
  await deliverPass(h.deps, NOW);
  assertEquals(h.sent[0][0].data, { kind: 'large_txn', logId: 'log-r1' });
  assertEquals(h.sent[0][0].ttl, 86400);
});

run('quiet hours hold the alert until quiet hours end in the person own zone', async () => {
  const night = new Date('2026-11-22T07:10:00Z'); // 23:10 Nov 21 in Vancouver
  const h = harness({ rows: [row('r1')] });
  const c = await deliverPass(h.deps, night);
  assertEquals(c.held, 1);
  assertEquals(h.calls, ['hold:r1:2026-11-22T15:00:00.000Z']);
  assertEquals(h.sent.length, 0);
});

run('digest users get nothing now: the row moves to digest', async () => {
  const h = harness({ rows: [row('r1', { kind: 'partner_large', prefs: { mode: 'digest', quiet_enabled: false, quiet_start: '22:00', quiet_end: '07:00', time_zone: 'UTC', last_digest_date: null } })] });
  const c = await deliverPass(h.deps, NOW);
  assertEquals(c.digested, 1);
  assertEquals(h.calls, ['finish:r1:digest:null::']);
  assertEquals(h.sent.length, 0);
});

run('no token records no_device in the log', async () => {
  const h = harness({ rows: [row('r1', { tokens: [] })] });
  const c = await deliverPass(h.deps, NOW);
  assertEquals(c.noDevice, 1);
  assertEquals(h.calls, ['finish:r1:dropped:no_device::']);
});

run('batches of at most 100 messages', async () => {
  const rows = Array.from({ length: 250 }, (_, i) => row('r' + i));
  const h = harness({ rows });
  await deliverPass(h.deps, NOW);
  assertEquals(BATCH_SIZE, 100);
  assertEquals(h.sent.map((b) => b.length), [100, 100, 50]);
});

run('DeviceNotRegistered drops the token and logs no_device', async () => {
  const h = harness({ rows: [row('r1')], tickets: () => ({ status: 'error', details: { error: 'DeviceNotRegistered' } }) });
  const c = await deliverPass(h.deps, NOW);
  assertEquals(c.tokensDropped, 1);
  assertEquals(h.calls, ['finish:r1:dropped:no_device::', `drop:${TOK}`]);
});

run('a failed send is requeued, then logged failed after 3 attempts', async () => {
  const boom = async () => {
    throw new Error('network');
  };
  const h1 = harness({ rows: [row('r1', { attempts: 1 })], send: boom });
  await deliverPass(h1.deps, NOW);
  assertEquals(h1.calls, ['requeue:r1:2026-11-22T20:02:00.000Z']);
  const h3 = harness({ rows: [row('r1', { attempts: 3 })], send: boom });
  const c = await deliverPass(h3.deps, NOW);
  assertEquals(c.failed, 1);
  assertEquals(h3.calls, ['finish:r1:dropped:failed::']);
});

run('one dead token and one live token still counts as sent', async () => {
  const h = harness({
    rows: [row('r1', { tokens: [TOK, 'ExponentPushToken[bbbbbbbbbbbbbbbb]'] })],
    tickets: (m) => (m.to === TOK ? { status: 'error', details: { error: 'DeviceNotRegistered' } } : { status: 'ok', id: 'live' }),
  });
  await deliverPass(h.deps, NOW);
  assertEquals(h.calls, ['finish:r1:sent:sent:live:ExponentPushToken[bbbbbbbbbbbbbbbb]', `drop:${TOK}`]);
});

run('partner text never carries a note or payee', async () => {
  const h = harness({ rows: [row('r1', { kind: 'partner_large', params: { who: 'Sam', hidden: false, category: 'Home', amount_minor: 32000, currency: 'USD', note: 'SECRET', payee: 'SECRET' } })] });
  await deliverPass(h.deps, NOW);
  assertEquals(h.sent[0][0].body, 'Sam spent $320 on Home');
  assertEquals(JSON.stringify(h.sent).includes('SECRET'), false);
});

const digestUser = (over: Partial<DigestUser> = {}): DigestUser => ({
  user_id: 'u1', prefs: { time_zone: 'America/Los_Angeles', last_digest_date: '2026-11-21' }, tokens: [TOK], counts: { bills_due: 2, over_cap: 1 }, ...over,
});

run('digest goes once at 08:00 local with the day summary', async () => {
  const eight = new Date('2026-11-22T16:00:00Z'); // 08:00 in Vancouver
  const h = harness({ digest: [digestUser()] });
  const c = await deliverPass(h.deps, eight);
  assertEquals(c.digestsSent, 1);
  assertEquals(h.sent[0][0].body, 'Today: 2 bills due, 1 category over its cap.');
  assertEquals(h.sent[0][0].channelId, 'digest');
  assertEquals(h.calls, ['digestClaim:u1:2026-11-22', 'digestDone:u1:2026-11-22']);
});

run('digest users outside the window or already sent today are untouched', async () => {
  const h = harness({ digest: [digestUser()] });
  await deliverPass(h.deps, NOW);
  const eight = new Date('2026-11-22T16:00:00Z');
  const h2 = harness({ digest: [digestUser({ prefs: { time_zone: 'America/Los_Angeles', last_digest_date: '2026-11-22' } })] });
  await deliverPass(h2.deps, eight);
  assertEquals(h.calls.concat(h2.calls), []);
  assertEquals(h.sent.length + h2.sent.length, 0);
});

run('a transient digest failure leaves it for the next minute', async () => {
  const eight = new Date('2026-11-22T16:00:00Z');
  const h = harness({ digest: [digestUser()], send: async () => { throw new Error('network'); } });
  await deliverPass(h.deps, eight);
  // The day was claimed, then given back (to the date it had) so the next minute retries.
  assertEquals(h.calls, ['digestClaim:u1:2026-11-22', 'digestRelease:u1:2026-11-22:2026-11-21']);
});

// 10-review S-1: one failed write cannot abort the pass and leave sent rows in 'sending' to be sent again.
run('a finish that throws for one row does not stop the other rows being finished', async () => {
  const calls: string[] = [];
  const h = harness({
    rows: [row('r1'), row('r2'), row('r3')],
    finish: async (id, status) => {
      if (id === 'r2') throw new Error('alerts_finish');
      calls.push(`finish:${id}:${status}`);
    },
  });
  const c = await deliverPass(h.deps, NOW);
  assertEquals(calls, ['finish:r1:sent', 'finish:r3:sent']);
  assertEquals(c.sent, 2);
  assertEquals(c.errors, 1);
  assertEquals(h.sent.length, 1);
});

run('a hold or no-device write that throws does not stop the sends', async () => {
  const night = new Date('2026-11-22T07:10:00Z');
  const h = harness({
    rows: [row('r1'), row('r2', { prefs: { mode: 'instant', quiet_enabled: false, quiet_start: '22:00', quiet_end: '07:00', time_zone: 'UTC', last_digest_date: null } })],
    hold: async () => {
      throw new Error('alerts_hold');
    },
  });
  const c = await deliverPass(h.deps, night);
  assertEquals(c.held, 0);
  assertEquals(c.sent, 1);
  assertEquals(c.errors, 1);
});

run('a dropToken that throws still finishes the row and drops the other tokens', async () => {
  const dead = ['ExponentPushToken[d1]', 'ExponentPushToken[d2]'];
  const h = harness({ rows: [row('r1', { tokens: dead })], tickets: () => ({ status: 'error', details: { error: 'DeviceNotRegistered' } }) });
  const dropped: string[] = [];
  h.deps.dropToken = async (t) => {
    if (t === dead[0]) throw new Error('alerts_drop_token');
    dropped.push(t);
  };
  const c = await deliverPass(h.deps, NOW);
  assertEquals(h.calls, ['finish:r1:dropped:no_device::']);
  assertEquals(dropped, [dead[1]]);
  assertEquals(c.tokensDropped, 1);
  assertEquals(c.errors, 1);
});

run('a digest already claimed by another run is not sent again', async () => {
  const eight = new Date('2026-11-22T16:00:00Z');
  const h = harness({ digest: [digestUser()], digestClaim: async () => false });
  const c = await deliverPass(h.deps, eight);
  assertEquals(c.digestsSent, 0);
  assertEquals(h.sent.length, 0);
  assertEquals(h.calls, []);
});

run('a digest claim that throws skips that person and still serves the others', async () => {
  const eight = new Date('2026-11-22T16:00:00Z');
  const h = harness({
    digest: [digestUser(), digestUser({ user_id: 'u2' })],
    digestClaim: async (u) => {
      if (u === 'u1') throw new Error('alerts_digest_claim');
      return true;
    },
  });
  const c = await deliverPass(h.deps, eight);
  assertEquals(c.digestsSent, 1);
  assertEquals(c.errors, 1);
  assertEquals(h.sent.flat().length, 1);
  assertEquals(h.calls, ['digestDone:u2:2026-11-22']);
});

run('two overlapping runs send the 08:00 digest once', async () => {
  const eight = new Date('2026-11-22T16:00:00Z');
  const taken = new Set<string>();
  const claim = async (u: string, d: string) => {
    const k = `${u}:${d}`;
    if (taken.has(k)) return false;
    taken.add(k);
    return true;
  };
  const a = harness({ digest: [digestUser()], digestClaim: claim });
  const b = harness({ digest: [digestUser()], digestClaim: claim });
  const [ca, cb] = await Promise.all([deliverPass(a.deps, eight), deliverPass(b.deps, eight)]);
  assertEquals(ca.digestsSent + cb.digestsSent, 1);
  assertEquals(a.sent.flat().length + b.sent.flat().length, 1);
});

run('receipts: a receiptsDone that throws does not stop the rest', async () => {
  const h = harness({
    receipts: [{ id: 'o1', ticket_ids: ['t1'], ticket_tokens: ['tokA'] }, { id: 'o2', ticket_ids: ['t2'], ticket_tokens: ['tokB'] }],
    getReceipts: async () => ({ t1: { status: 'ok' }, t2: { status: 'error', details: { error: 'DeviceNotRegistered' } } }),
    receiptsDone: async (id) => {
      if (id === 'o1') throw new Error('alerts_receipts_done');
    },
  });
  const r = await receiptsPass(h.deps, NOW);
  assertEquals(r, { checked: 1, tokensDropped: 1 });
  assertEquals(h.calls, ['drop:tokB']);
});

run('receipts: DeviceNotRegistered drops the token and checked rows are marked', async () => {
  const receipts: Record<string, ExpoReceipt> = {
    t1: { status: 'ok' },
    t2: { status: 'error', details: { error: 'DeviceNotRegistered' } },
  };
  const h = harness({
    receipts: [{ id: 'o1', ticket_ids: ['t1', 't2'], ticket_tokens: ['tokA', 'tokB'] }, { id: 'o2', ticket_ids: ['t9'], ticket_tokens: ['tokC'] }],
    getReceipts: async () => receipts,
  });
  const r = await receiptsPass(h.deps, NOW);
  assertEquals(r, { checked: 1, tokensDropped: 1 });
  assertEquals(h.calls, ['receiptsDone:o1', 'drop:tokB']);
});

run('expo wrapper posts to the push endpoint with the bearer token', async () => {
  let seen: { url: string; headers: Record<string, string>; body: string } | null = null;
  const expo = createExpo(async (url, init) => {
    seen = { url, headers: init.headers, body: init.body };
    return { ok: true, status: 200, json: async () => ({ data: [{ status: 'ok', id: 'x' }] }) };
  }, 'SECRET-TOKEN');
  const tickets = await expo.send([{ to: TOK, title: 'FincWin', body: 'b', channelId: 'alerts', ttl: 86400, data: { kind: 'k' } }]);
  assertEquals(tickets, [{ status: 'ok', id: 'x' }]);
  assertEquals((seen as unknown as { url: string }).url, SEND_URL);
  assertEquals((seen as unknown as { headers: Record<string, string> }).headers.authorization, 'Bearer SECRET-TOKEN');
});

run('expo wrapper sends no authorization header when no token is set', async () => {
  let headers: Record<string, string> = {};
  const expo = createExpo(async (_u, init) => {
    headers = init.headers;
    return { ok: true, status: 200, json: async () => ({ data: [] }) };
  }, undefined);
  await expo.send([]);
  assertEquals('authorization' in headers, false);
});
