// Runs under Deno (`npm run test:deno`, the CI deno job) and under Jest (the default suite): the same file, no runner imports.
import {
  deleteAccount,
  privateLineReceiptObjects,
  RECEIPT_PAGE,
  type DeleteDeps,
  type ReceiptRowWithLine,
  type StorageObject,
} from './delete.ts';

type Runner = (name: string, fn: () => Promise<void>) => void;
const g = globalThis as unknown as { Deno?: { test: Runner }; test?: Runner };
const run: Runner = (name, fn) => (g.Deno ? g.Deno.test(name, fn) : (g.test as Runner)(name, fn));

function assertEquals(actual: unknown, expected: unknown, msg = ''): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${msg} expected ${JSON.stringify(expected)} got ${JSON.stringify(actual)}`);
  }
}

function harness(over: Partial<DeleteDeps> = {}) {
  const calls: string[] = [];
  const deleted: string[] = [];
  const objects: StorageObject[] = [{ bucket: 'statement-uploads', path: 'u1/a.pdf' }];
  const deps: DeleteDeps = {
    getCallerId: () => Promise.resolve('u1'),
    listUserStorageObjects: (uid) => {
      calls.push('list:' + uid);
      return Promise.resolve(objects);
    },
    removeStorageObjects: () => {
      calls.push('remove');
      return Promise.resolve();
    },
    deleteAuthUser: (uid) => {
      calls.push('delete');
      deleted.push(uid);
      return Promise.resolve({ error: null });
    },
    ...over,
  };
  return { deps, calls, deleted };
}

run('no verified caller answers 401 and deletes nobody', async () => {
  const h = harness({ getCallerId: () => Promise.resolve(null) });
  const res = await deleteAccount({ method: 'POST' }, h.deps);
  assertEquals(res, { status: 401, body: { ok: false, error: 'unauthorized' } });
  assertEquals(h.deleted, []);
});

run('a caller lookup that throws is also 401', async () => {
  const h = harness({ getCallerId: () => Promise.reject(new Error('x')) });
  const res = await deleteAccount({ method: 'POST' }, h.deps);
  assertEquals(res.status, 401);
  assertEquals(h.deleted, []);
});

run('removes the caller storage objects before deleting the auth user', async () => {
  const h = harness();
  const res = await deleteAccount({ method: 'POST' }, h.deps);
  assertEquals(res, { status: 200, body: { ok: true } });
  assertEquals(h.calls, ['list:u1', 'remove', 'delete']);
  assertEquals(h.deleted, ['u1']);
});

run('skips storage removal when there are no objects', async () => {
  const h = harness({ listUserStorageObjects: () => Promise.resolve([]) });
  const res = await deleteAccount({ method: 'POST' }, h.deps);
  assertEquals(res.status, 200);
  assertEquals(h.calls, ['delete']);
});

run('an auth delete error answers 500 and is not reported as done', async () => {
  const h = harness({ deleteAuthUser: () => Promise.resolve({ error: 'boom' }) });
  const res = await deleteAccount({ method: 'POST' }, h.deps);
  assertEquals(res, { status: 500, body: { ok: false, error: 'delete_failed' } });
});

run('a storage failure answers 500 and the auth user is not deleted', async () => {
  const h = harness({ removeStorageObjects: () => Promise.reject(new Error('storage')) });
  const res = await deleteAccount({ method: 'POST' }, h.deps);
  assertEquals(res.status, 500);
  assertEquals(h.deleted, []);
});

run('GET answers 405 and touches nothing', async () => {
  const h = harness();
  const res = await deleteAccount({ method: 'GET' }, h.deps);
  assertEquals(res, { status: 405, body: { ok: false, error: 'method' } });
  assertEquals(h.calls, []);
});

run('a user_id in the body is ignored: the verified caller is the one deleted', async () => {
  const h = harness();
  await deleteAccount({ method: 'POST', body: { user_id: 'victim', userId: 'victim' } }, h.deps);
  assertEquals(h.deleted, ['u1']);
  assertEquals(h.calls[0], 'list:u1');
});

// 10.1-12 (D-19): receipt files go with the account only when they sit on the leaver's private lines.
const row = (path: string, createdBy: string, isShared: boolean): ReceiptRowWithLine => ({
  object_path: path,
  transactions: { created_by: createdBy, is_shared: isShared },
});
const pager = (rows: ReceiptRowWithLine[]) => (from: number, to: number) =>
  Promise.resolve({ data: rows.slice(from, to + 1), error: null });

run('receipts on the leaver private lines are listed', async () => {
  const res = await privateLineReceiptObjects(pager([row('u1/t1/a.jpg', 'u1', false), row('u1/t2/b.pdf', 'u1', false)]), 'u1');
  assertEquals(res, [
    { bucket: 'receipts', path: 'u1/t1/a.jpg' },
    { bucket: 'receipts', path: 'u1/t2/b.pdf' },
  ]);
});

run('a receipt on the leaver shared line is not listed', async () => {
  const res = await privateLineReceiptObjects(pager([row('u1/t1/a.jpg', 'u1', true), row('u1/t2/b.jpg', 'u1', false)]), 'u1');
  assertEquals(res, [{ bucket: 'receipts', path: 'u1/t2/b.jpg' }]);
});

run('a receipt the leaver uploaded to a partner shared line is not listed', async () => {
  const res = await privateLineReceiptObjects(pager([row('u2/t9/a.jpg', 'u2', true), row('u2/t8/b.jpg', 'u2', false)]), 'u1');
  assertEquals(res, []);
});

run('an embedded line returned as a one-item list is read the same way', async () => {
  const res = await privateLineReceiptObjects(
    pager([{ object_path: 'u1/t1/a.jpg', transactions: [{ created_by: 'u1', is_shared: false }] }]),
    'u1',
  );
  assertEquals(res, [{ bucket: 'receipts', path: 'u1/t1/a.jpg' }]);
});

run('receipts are read page by page until a short page', async () => {
  const rows = Array.from({ length: RECEIPT_PAGE + 5 }, (_, i) => row(`u1/t/${i}.jpg`, 'u1', false));
  const res = await privateLineReceiptObjects(pager(rows), 'u1');
  assertEquals(res.length, RECEIPT_PAGE + 5);
});

run('a receipts query error makes the whole request answer 500 and deletes nobody', async () => {
  const h = harness({
    listUserStorageObjects: (uid) =>
      privateLineReceiptObjects(() => Promise.resolve({ data: null, error: { message: 'boom' } }), uid),
  });
  const res = await deleteAccount({ method: 'POST' }, h.deps);
  assertEquals(res, { status: 500, body: { ok: false, error: 'delete_failed' } });
  assertEquals(h.deleted, []);
});
