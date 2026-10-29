// N-04 (05.2 walkthrough): Undo on the Not regular, Reset, income tag and Stopped toasts dismissed the toast but
// apply_undo_step never ran. Real host + real useUndo + real write queue; only the supabase client is faked.
/* eslint-disable import/first, @typescript-eslint/no-require-imports */
globalThis.crypto = globalThis.crypto ?? (require('crypto').webcrypto as Crypto);
import React from 'react';
import { AccessibilityInfo, Pressable } from 'react-native';
import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { ShellTestProviders, resetShellStores } from '@/shell/__tests__/testUtils';
import { createFakeSupabase, type FakeResponse, type FakeSupabase } from '@/db/__tests__/fakeSupabase';
import type { DbClient } from '@/db/rows';
import { registerMutationDefaults } from '@/data/mutations';
import { useAddDismissal } from '@/data/mutations/dismissals';
import { undoLabelText } from '@/i18n/undoLabel';
import { showToast } from '@/state/undoToast';
import { pushSheet, removeSheet } from '@/state/sheetStack';
import { UndoToastHost } from '../UndoToastHost';
/* eslint-enable import/first, @typescript-eslint/no-require-imports */

type ToastInput = Parameters<typeof showToast>[0];

jest.setTimeout(30000);
let mockUuid = 0;
jest.mock('expo-crypto', () => ({ randomUUID: jest.fn(() => `id-${++mockUuid}`) }));
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

// The toast shapes exactly as the four callers show them.
const FAMILIES: readonly (readonly [string, ToastInput])[] = [
  ['paymentDismissed', { kind: 'ordinary', text: undoLabelText('paymentDismissed', { name: 'Pay' }), stepId: 'step-1' }],
  ['setupReset', { kind: 'ordinary', text: { key: 'decide.settings.toastReset' }, stepId: 'step-1' }],
  ['incomeTagged', { kind: 'ordinary', text: { key: 'activity.incomeTag.toastTagged', params: { count: 3, payer: 'Acme' } }, stepId: 'step-1' }],
  ['seriesStopped', { kind: 'destructive', text: undoLabelText('seriesStopped', { name: 'Rent' }), stepId: 'step-1' }],
];

it.each(FAMILIES)('Undo on a %s toast sends apply_undo_step with the toast step id', async (_name, toast) => {
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
    showToast(toast);
  });
  await fireEvent.press(screen.getByLabelText('Undo'));
  await waitFor(() => expect(fake.calls.some((c) => c.method === 'rpc')).toBe(true));
  expect(fake.calls.find((c) => c.method === 'rpc')?.args).toEqual(['apply_undo_step', { p_step_id: 'step-1' }]);
});

// ---- the real forward write (Not regular) through the real queue ----
const DISMISSAL = { id: 'd1', household_id: 'h1', payee_key: 'pay', direction: 'in', dismissed_at: 't', created_by: 'me', deleted_at: null, version: 1 };

function Probe({ onDismiss }: { onDismiss: (r: { id: string; stepId: string }) => void }) {
  const { dismiss } = useAddDismissal('h1', 'me');
  return <Pressable accessibilityLabel="go" onPress={() => onDismiss(dismiss({ payeeKey: 'pay', direction: 'in' }))} />;
}

async function setup(responses: FakeResponse[]) {
  const fake = createFakeSupabase() as FakeSupabase & DbClient;
  mockActiveClient = fake;
  for (const r of responses) fake.respondWith(r);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  registerMutationDefaults(qc);
  await render(
    <ShellTestProviders>
      <QueryClientProvider client={qc}>
        <Probe
          onDismiss={({ stepId }) => {
            showToast({ kind: 'ordinary', text: undoLabelText('paymentDismissed', { name: 'Pay' }), stepId });
          }}
        />
        <UndoToastHost />
      </QueryClientProvider>
    </ShellTestProviders>
  );
  return fake;
}

const OK = { data: null, error: null, status: 201 };
const rpcCalls = (fake: FakeSupabase) => fake.calls.filter((c) => c.method === 'rpc');
const stepIdOf = (fake: FakeSupabase) =>
  (fake.calls.find((c) => c.table === 'undo_log' && c.method === 'insert')?.args[0] as { id: string }).id;

it('Test B: Undo pressed straight after the forward write starts still undoes it, after the step record', async () => {
  const fake = await setup([{ data: DISMISSAL, error: null, status: 201 }, OK, { data: { status: 'undone' }, error: null, status: 200 }]);
  await fireEvent.press(screen.getByLabelText('go'));
  await fireEvent.press(screen.getByLabelText('Undo'));
  await waitFor(() => expect(rpcCalls(fake)).toHaveLength(1));
  expect(rpcCalls(fake)[0]?.args).toEqual(['apply_undo_step', { p_step_id: stepIdOf(fake) }]);
  expect(await screen.findByText(/Undone/)).toBeTruthy();
});

it('Test C: the step insert fails once; Undo waits for the queued step record, never answers "can\'t be undone"', async () => {
  const fake = await setup([
    { data: DISMISSAL, error: null, status: 201 },
    { data: null, error: { message: 'boom' }, status: 500 }, // immediate insertUndoStep
    OK, // queued recordUndoStep
    { data: { status: 'undone' }, error: null, status: 200 },
  ]);
  await fireEvent.press(screen.getByLabelText('go'));
  await fireEvent.press(screen.getByLabelText('Undo'));
  await waitFor(() => expect(rpcCalls(fake)).toHaveLength(1));
  const calls = fake.calls.map((c) => (c.method === 'rpc' ? 'rpc' : `${c.table}.${c.method}`));
  expect(calls.indexOf('rpc')).toBeGreaterThan(calls.lastIndexOf('undo_log.insert'));
  expect(await screen.findByText(/Undone/)).toBeTruthy();
});

it('Test D: with a sheet open only the sheet host shows the toast; after it closes only the app host does; each Undo sends one rpc', async () => {
  const fake = createFakeSupabase() as FakeSupabase & DbClient;
  mockActiveClient = fake;
  fake.respondWith({ data: { status: 'undone' }, error: null, status: 200 });
  fake.respondWith({ data: { status: 'undone' }, error: null, status: 200 });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  registerMutationDefaults(qc);
  const tree = (withSheetHost: boolean) => (
    <ShellTestProviders>
      <QueryClientProvider client={qc}>
        <UndoToastHost />
        {withSheetHost ? <UndoToastHost placement="sheet" /> : null}
      </QueryClientProvider>
    </ShellTestProviders>
  );
  const view = await render(tree(true));
  const toast: ToastInput = { kind: 'ordinary', text: undoLabelText('seriesStopped', { name: 'Rent' }), stepId: 'step-sheet' };
  await act(async () => {
    pushSheet('s1');
  });
  await act(async () => {
    showToast(toast);
  });
  expect(screen.getAllByLabelText('Undo')).toHaveLength(1);
  await fireEvent.press(screen.getByLabelText('Undo'));
  await waitFor(() => expect(rpcCalls(fake)).toHaveLength(1));
  await act(async () => {
    removeSheet('s1');
  });
  await view.rerender(tree(false)); // the closed sheet's Modal, and the host inside it, are gone
  await act(async () => {
    showToast({ ...toast, stepId: 'step-app' });
  });
  expect(screen.getAllByLabelText('Undo')).toHaveLength(1);
  await fireEvent.press(screen.getByLabelText('Undo'));
  await waitFor(() => expect(rpcCalls(fake)).toHaveLength(2));
  expect(rpcCalls(fake).map((c) => (c.args[1] as { p_step_id: string }).p_step_id)).toEqual(['step-sheet', 'step-app']);
});
