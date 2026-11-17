// Runs under Deno (`npm run test:deno`, the CI deno job) and under Jest (the default suite): the same file, no runner imports.
import { deleteAccount, type DeleteDeps, type StorageObject } from './delete.ts';

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
