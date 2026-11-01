// 05.3-97: a toast's Undo replays only the step it was shown for. The client reads the step's label and touched rows
// first; a mismatch applies nothing and says so. Old persisted undo mutations (no `expect`) are guarded by label.
/* eslint-disable import/first, @typescript-eslint/no-require-imports */
globalThis.crypto = globalThis.crypto ?? (require('crypto').webcrypto as Crypto);

import React from 'react';
import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import { registerMutationDefaults } from '@/data/mutations';
import { recordFailedWrite } from '@/data/sync/failedWrites';
import { getToast, resetToastForTests } from '@/state/undoToast';
import { useUndo, type UndoVars } from '../undo';
/* eslint-enable import/first, @typescript-eslint/no-require-imports */

let mockActiveClient: unknown;
jest.mock('@/services/supabase', () => ({
  get supabase() {
    return mockActiveClient;
  },
}));
jest.mock('@/data/sync/failedWrites', () => ({ recordFailedWrite: jest.fn(async () => undefined) }));

jest.setTimeout(60000);

type Meta = { id: string; label_key: string; status: string; touched_ids: string[] } | null;

function makeClient(meta: Meta) {
  const applied: unknown[] = [];
  const q = {
    select: () => q,
    eq: () => q,
    maybeSingle: async () => ({ data: meta, error: null, status: 200 }),
  };
  const client = {
    from: () => q,
    rpc: (_n: string, args: unknown) => {
      applied.push(args);
      return { then: (f: (v: unknown) => unknown) => Promise.resolve({ data: { status: 'undone' }, error: null, status: 200 }).then(f) };
    },
    auth: { getSession: async () => ({ data: { session: { access_token: 't' } }, error: null }) },
  };
  return { client, applied };
}

const base: UndoVars = {
  stepId: 's1',
  ownerId: 'u1',
  householdId: 'h1',
  labelKey: 'decisionDeleted',
  labelParams: { name: 'Mug' },
};

async function run(meta: Meta, vars: UndoVars) {
  onlineManager.setOnline(true);
  resetToastForTests();
  (recordFailedWrite as jest.Mock).mockClear();
  const c = makeClient(meta);
  mockActiveClient = c.client;
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  registerMutationDefaults(qc);
  const wrapper = ({ children }: { children: React.ReactNode }) => React.createElement(QueryClientProvider, { client: qc }, children);
  const { result } = await renderHook(() => useUndo(), { wrapper });
  result.current.undo(vars);
  await waitFor(() => expect(getToast()).not.toBeNull(), { timeout: 20000 });
  return c;
}

const step = (label: string, touched: string[]): Meta => ({ id: 's1', label_key: label, status: 'available', touched_ids: touched });

it('the step touches the named row with the right label: applied, "Undone" toast', async () => {
  const c = await run(step('decisionDeleted', ['chkB', 'g1']), { ...base, expect: { entityId: 'chkB' } });
  expect(c.applied).toEqual([{ p_step_id: 's1' }]);
  expect(getToast()?.text?.key).toBe('undo.reverted');
});

it('the step touches a different row: nothing applied, wrongStep toast, no failed write', async () => {
  const c = await run(step('decisionDeleted', ['chkA']), { ...base, expect: { entityId: 'chkB' } });
  expect(c.applied).toEqual([]);
  expect(getToast()?.text?.key).toBe('undo.wrongStep');
  expect(recordFailedWrite).not.toHaveBeenCalled();
});

it('the step has another label (planSaved for a decisionDeleted toast): same refusal', async () => {
  const c = await run(step('planSaved', ['chkB']), { ...base, expect: { entityId: 'chkB' } });
  expect(c.applied).toEqual([]);
  expect(getToast()?.text?.key).toBe('undo.wrongStep');
});

it('the step is not recorded: no apply call, notRecorded toast', async () => {
  const c = await run(null, { ...base, expect: { entityId: 'chkB' } });
  expect(c.applied).toEqual([]);
  expect(getToast()?.text?.key).toBe('undo.notRecorded');
});

it('a persisted undo with no expect (older build) is guarded by label: wrong label refuses, right label applies', async () => {
  const wrong = await run(step('planSaved', ['chkA']), base);
  expect(wrong.applied).toEqual([]);
  expect(getToast()?.text?.key).toBe('undo.wrongStep');
  const right = await run(step('decisionDeleted', ['chkB']), base);
  expect(right.applied).toEqual([{ p_step_id: 's1' }]);
});
