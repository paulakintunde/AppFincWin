// 08-08 spike: two real supabase-js clients, local Supabase. Run with `npm run test:realtime`.
import { reconcile } from '../reconcile';
import { insertLine, setupWorld, sleep, subscribe, waitFor, type Member, type World } from './harness';

let w: World;

const seen = (m: Pick<Member, 'events'>, id: string) =>
  m.events.filter((e) => e.table === 'transactions' && e.row.id === id);

beforeAll(async () => {
  w = await setupWorld();
  await subscribe(w.b, w.householdId);
  await subscribe(w.a, w.householdId);
  // Cold start: the first change after SUBSCRIBED can lag while Realtime binds the postgres_changes
  // stream. Measured separately so scenario a reports the steady-state latency.
  const t0 = Date.now();
  const warm = await insertLine(w, { shared: true });
  const got = await waitFor(() => seen(w.b, warm).length > 0, 20000);
  console.log('SPIKE cold-start first event reached B:', got, 'after ms', got ? (seen(w.b, warm)[0]?.at ?? t0) - t0 : -1);
});

afterAll(async () => {
  if (w) await w.cleanup();
});

describe('Realtime two-client spike', () => {
  it('a. a shared line written by A reaches B within 2000 ms', async () => {
    const t0 = Date.now();
    const id = await insertLine(w, { shared: true });
    const ok = await waitFor(() => seen(w.b, id).length > 0, 2000);
    const latency = (seen(w.b, id)[0]?.at ?? t0 - 1) - t0;
    console.log('SPIKE a latency ms', latency);
    expect(ok).toBe(true);
  });

  it('b. a personal line written by A never reaches B (3000 ms)', async () => {
    const id = await insertLine(w, { shared: false });
    const mine = await waitFor(() => seen(w.a, id).length > 0, 2000); // A is allowed to see its own personal line
    await sleep(3000);
    console.log('SPIKE b A saw own personal line:', mine);
    expect(seen(w.b, id)).toHaveLength(0);
  });

  it('c. making a shared line personal sends B a made_private notice and no line columns', async () => {
    const id = await insertLine(w, { shared: true });
    await waitFor(() => seen(w.b, id).length > 0, 2000);
    const flipAt = Date.now();
    const flip = await w.admin.from('transactions').update({ is_shared: false }).eq('id', id);
    expect(flip.error).toBeNull();
    const ev = await w.admin
      .from('household_events')
      .insert({ household_id: w.householdId, kind: 'made_private', actor_id: w.a.id, ref_id: id, params: {} })
      .select('id')
      .single();
    expect(ev.error).toBeNull();
    const gotNotice = await waitFor(
      () => w.b.events.some((e) => e.table === 'household_events' && e.row.id === ev.data!.id),
      2000
    );
    await sleep(2000);
    const afterFlip = seen(w.b, id).filter((e) => e.at >= flipAt);
    console.log('SPIKE c notice:', gotNotice, 'line events after flip:', afterFlip.length);
    expect(gotNotice).toBe(true);
    expect(afterFlip).toHaveLength(0);
  });

  it('d. B offline mid-edit refetches v+1 on reconnect; its stale queued write is refused naming A', async () => {
    const id = await insertLine(w, { shared: true, createdBy: w.a.id, paidBy: w.b.id, note: 'original' });
    const first = await w.b.client.from('transactions').select('id, version, note, updated_by').eq('id', id).single();
    expect(first.error).toBeNull();
    const v = first.data!.version as number;

    // B goes offline mid-edit.
    await w.b.client.removeAllChannels();
    w.b.channels.length = 0;
    await w.b.client.realtime.disconnect();

    // A edits through the real write path.
    const aWrite = await w.a.client.rpc('apply_patches', {
      p_ops: [{ entity: 'transactions', id, expectedVersion: v, patch: { note: 'A edit' } }],
    });
    expect(aWrite.error).toBeNull();
    expect((aWrite.data as any).status).toBe('applied');

    // B reconnects, resubscribes, and on SUBSCRIBED refetches (the app rule).
    w.b.events.length = 0;
    await w.b.client.realtime.connect();
    await subscribe(w.b, w.householdId);
    const refetch = await w.b.client.from('transactions').select('id, version, note, updated_by').eq('id', id).single();
    expect(refetch.data!.version).toBe(v + 1);
    expect(refetch.data!.note).toBe('A edit');

    // B's queued write still carries the old base version; the server refuses it and names A.
    const bWrite = await w.b.client.rpc('apply_patches', {
      p_ops: [{ entity: 'transactions', id, expectedVersion: v, patch: { note: 'B stale edit' } }],
    });
    expect(bWrite.error).toBeNull();
    const res = bWrite.data as any;
    console.log('SPIKE d result:', JSON.stringify(res));
    expect(res.status).toBe('conflict');
    expect(res.conflict.updated_by).toBe(w.a.id);
    const final = await w.admin.from('transactions').select('note').eq('id', id).single();
    expect(final.data!.note).toBe('A edit');
  });

  it('e. A\'s own-write echo is dropped by version', async () => {
    const id = await insertLine(w, { shared: true });
    await waitFor(() => seen(w.a, id).length > 0, 2000);
    const row = await w.a.client.from('transactions').select('version').eq('id', id).single();
    const v = row.data!.version as number;
    w.a.events.length = 0;
    const r = await w.a.client.rpc('apply_patches', {
      p_ops: [{ entity: 'transactions', id, expectedVersion: v, patch: { note: 'echo' } }],
    });
    expect((r.data as any).status).toBe('applied');
    expect(await waitFor(() => seen(w.a, id).length > 0, 2000)).toBe(true);
    const echo = seen(w.a, id)[0]!;
    expect(echo.row.version).toBe(v + 1);
    expect(reconcile(echo.row.version, v + 1, false)).toBe('drop');
  });

  it('f. out-of-order versions [5, 4] leave the cache at 5', () => {
    let cache: number | undefined;
    for (const ev of [5, 4]) if (reconcile(ev, cache, false) === 'apply') cache = ev;
    expect(cache).toBe(5);
  });

  it('g. after B is removed, a new shared line is not delivered to B (3000 ms)', async () => {
    const rm = await w.admin.from('household_members').delete().eq('household_id', w.householdId).eq('user_id', w.b.id);
    expect(rm.error).toBeNull();
    await sleep(500);
    w.b.events.length = 0;
    const id = await insertLine(w, { shared: true });
    await waitFor(() => seen(w.a, id).length > 0, 2000);
    await sleep(3000);
    console.log('SPIKE g events to removed B:', w.b.events.length);
    expect(seen(w.b, id)).toHaveLength(0);
  });
});
