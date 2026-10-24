// Device bug 2026-10-24: Undo on "Pot saved" closed the toast but apply_undo_step never reached the server.
// Real host + real useUndo + real write queue; only the supabase client is faked.
/* eslint-disable import/first, @typescript-eslint/no-require-imports */
globalThis.crypto = globalThis.crypto ?? (require('crypto').webcrypto as Crypto);
import React from 'react';
import { AccessibilityInfo } from 'react-native';
import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { ShellTestProviders, resetShellStores } from '@/shell/__tests__/testUtils';
import { createFakeSupabase, type FakeSupabase } from '@/db/__tests__/fakeSupabase';
import type { DbClient } from '@/db/rows';
import { registerMutationDefaults } from '@/data/mutations';
import { showToast } from '@/state/undoToast';
import { UndoToastHost } from '../UndoToastHost';
/* eslint-enable import/first, @typescript-eslint/no-require-imports */

jest.setTimeout(30000);
let mockActiveClient: unknown;
jest.mock('@/services/supabase', () => ({
  get supabase() {
    return mockActiveClient;
  },
}));
jest.mock('@/data/sync/failedWrites', () => ({ recordFailedWrite: jest.fn(async () => undefined) }));
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 47, bottom: 12, left: 0, right: 0 }),
}));
jest.mock('@/data/queries/activity', () => ({ useHouseholdMemberNames: () => new Map() }));
jest.mock('@/features/record/useRecordContext', () => ({ useRecordContext: () => ({ userId: 'me', householdId: 'h1', timeZone: 'UTC' }) }));

beforeEach(() => {
  onlineManager.setOnline(true);
  jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockImplementation(async () => false);
  jest.spyOn(AccessibilityInfo, 'addEventListener').mockImplementation((() => ({ remove: jest.fn() })) as never);
  resetShellStores();
});

it('Undo on a Pot saved toast sends apply_undo_step with the toast step id', async () => {
  const fake = createFakeSupabase() as FakeSupabase & DbClient;
  mockActiveClient = fake;
  fake.respondWith({ data: { status: 'undone' }, error: null, status: 200 });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  registerMutationDefaults(qc);
  await render(
    <ShellTestProviders>
      <QueryClientProvider client={qc}>
        <UndoToastHost />
      </QueryClientProvider>
    </ShellTestProviders>
  );
  await act(async () => {
    showToast({ kind: 'destructive', text: { key: 'decide.pots.toast.saved', params: { undoLabel: 'potAdded', name: 'P' } }, stepId: 'step-pot' });
  });
  await fireEvent.press(screen.getByLabelText('Undo'));
  await waitFor(() => expect(fake.calls.some((c) => c.method === 'rpc')).toBe(true));
  expect(fake.calls.find((c) => c.method === 'rpc')?.args).toEqual(['apply_undo_step', { p_step_id: 'step-pot' }]);
});
