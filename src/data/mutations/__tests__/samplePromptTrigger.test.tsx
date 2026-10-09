// 02.2-33 (D-11): the trigger rule, the once-per-session store and the shared batch insert path.
/* eslint-disable import/first, @typescript-eslint/no-require-imports */
globalThis.crypto = globalThis.crypto ?? (require('crypto').webcrypto as Crypto);

import { QueryClient } from '@tanstack/react-query';
import type { DbClient, NewTransaction } from '@/db/rows';
import { createFakeSupabase, type FakeSupabase } from '@/db/__tests__/fakeSupabase';
import { queryKeys } from '@/data/keys';
import {
  dismissSampleClearPrompt,
  getSampleClearPromptRequestForTests,
  resetSamplePromptForTests,
} from '@/state/samplePrompt';
import { maybeRequestSampleClearPrompt } from '../samplePromptTrigger';
import { insertRowsAsOneStep } from '../batchInsert';
/* eslint-enable import/first, @typescript-eslint/no-require-imports */

jest.mock('@/services/supabase', () => ({ supabase: {} }));
jest.mock('@/data/sync/failedWrites', () => ({ recordFailedWrite: jest.fn(async () => undefined) }));

const ids = { householdId: 'h1', userId: 'u1' };
const prefs = (answered: string | null) => ({ week_start: null, sample_prompt_answered_at: answered });

function client(opts: { exists?: boolean; prefs?: ReturnType<typeof prefs> }): QueryClient {
  const qc = new QueryClient();
  if (opts.exists !== undefined) qc.setQueryData(queryKeys.sampleExists('h1'), opts.exists);
  if (opts.prefs) qc.setQueryData(queryKeys.recordPrefs('u1'), opts.prefs);
  return qc;
}

beforeEach(() => resetSamplePromptForTests());

describe('maybeRequestSampleClearPrompt', () => {
  it('requests only when samples exist and the prompt is unanswered', () => {
    maybeRequestSampleClearPrompt(client({ exists: true, prefs: prefs(null) }), ids);
    expect(getSampleClearPromptRequestForTests()).toBe(true);
  });

  it.each([
    ['sample existence unknown', { prefs: prefs(null) }],
    ['no samples', { exists: false, prefs: prefs(null) }],
    ['prefs unknown', { exists: true }],
    ['already answered', { exists: true, prefs: prefs('2026-10-01T00:00:00Z') }],
  ])('does nothing when %s', (_name, opts) => {
    maybeRequestSampleClearPrompt(client(opts), ids);
    expect(getSampleClearPromptRequestForTests()).toBe(false);
  });

  it('requests at most once per session', () => {
    const qc = client({ exists: true, prefs: prefs(null) });
    maybeRequestSampleClearPrompt(qc, ids);
    dismissSampleClearPrompt();
    maybeRequestSampleClearPrompt(qc, ids);
    expect(getSampleClearPromptRequestForTests()).toBe(false);
  });
});

describe('insertRowsAsOneStep', () => {
  const row = (n: number): NewTransaction => ({
    id: `r${n}`,
    household_id: 'h1',
    account_id: 'a1',
    original_amount: -100 as never,
    original_currency: 'GBP',
    local_date: '2026-10-05',
    time_zone: 'UTC',
    note: null,
  });

  it('asks once after the undo step is recorded', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    fake
      .respondWith({ data: [{ id: 'r1', local_date: '2026-10-05', version: 1, rate_pending: false }], error: null, status: 201 })
      .respondWith({ data: null, error: null, status: 201 });
    const qc = client({ exists: true, prefs: prefs(null) });
    await insertRowsAsOneStep(qc, fake, { rows: [row(1)], ownerId: 'u1', stepId: 's1', labelKey: 'pasted' });
    expect(getSampleClearPromptRequestForTests()).toBe(true);
  });
});
