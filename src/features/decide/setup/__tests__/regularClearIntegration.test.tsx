// 05.2-54 (F-09): after Clear “Not regular” the card is back to unmarked, with a real query client and the real mutation.
/* eslint-disable import/first, @typescript-eslint/no-require-imports */
globalThis.crypto = globalThis.crypto ?? (require('crypto').webcrypto as Crypto);

import React from 'react';
import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { FontScaleProvider } from '@/theme/FontScaleProvider';
import type { DbClient } from '@/db/rows';
import type { RecurringDismissalRow } from '@/db/recurringDismissals';
import { createFakeSupabase, type FakeSupabase } from '@/db/__tests__/fakeSupabase';
import { queryKeys } from '@/data/keys';
import { clearVersionChains } from '@/data/sync/versionChain';
import { registerMutationDefaults } from '@/data/mutations';
import { RegularStep } from '../steps/RegularStep';
/* eslint-enable import/first, @typescript-eslint/no-require-imports */

jest.setTimeout(30000);
let mockActiveClient: unknown;
jest.mock('@/services/supabase', () => ({
  get supabase() {
    return mockActiveClient;
  },
}));
jest.mock('@/features/decide/useDecideAccess', () => ({ useDecideAccess: () => ({ v3: true }) }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'uuid-1' }));
jest.mock('@/ui/haptics', () => ({ hapticSelection: jest.fn() }));
jest.mock('@/data/sync/failedWrites', () => ({ recordFailedWrite: jest.fn(async () => undefined) }));
jest.mock('@/db/undoLog', () => ({ insertUndoStep: jest.fn(async () => undefined) }));
jest.mock('@/state/undoToast', () => ({ showToast: jest.fn() }));
jest.mock('@/data/queries/recurringSeries', () => ({ useRecurringSeries: () => ({ data: [] }) }));
jest.mock('@/data/queries/accounts', () => ({ useAccounts: () => ({ data: [] }) }));
jest.mock('@/features/record/useRecordContext', () => ({
  useRecordContext: () => ({ householdId: 'hh-1', userId: 'user-1', homeCurrency: 'USD', timeZone: 'UTC', today: '2026-09-15' }),
}));
const txn = (id: string, date: string) => ({
  id, name: 'Gym', original_amount: -4000, original_currency: 'USD', local_date: date, is_sample: false, transfer_id: null,
  status: 'posted', recurring_series_id: null, account_id: 'a1', category_id: null, is_refund: false, refund_of: null,
});
jest.mock('@/db/transactions', () => ({
  fetchTransactionsInRange: async () => [txn('g1', '2026-06-05'), txn('g2', '2026-07-05'), txn('g3', '2026-08-05')],
}));

const HH = 'hh-1';
const KEY = queryKeys.recurringDismissals(HH);
const dismissal: RecurringDismissalRow = {
  id: 'dis-1', household_id: HH, payee_key: 'gym|USD|-1', direction: 'out', dismissed_at: '2026-10-01T00:00:00Z', created_by: 'user-1', deleted_at: null, version: 2,
};
const METRICS = { frame: { x: 0, y: 0, width: 402, height: 874 }, insets: { top: 62, bottom: 34, left: 0, right: 0 } };

it('Clear returns the card to unmarked with both buttons enabled, patches the cache and invalidates on success', async () => {
  const fake = createFakeSupabase() as FakeSupabase & DbClient;
  mockActiveClient = fake;
  onlineManager.setOnline(true);
  clearVersionChains();
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  registerMutationDefaults(qc);
  qc.setQueryData(KEY, [dismissal]);
  fake.respondWith({ data: [{ ...dismissal, version: 3, deleted_at: '2026-10-28T00:00:00Z' }], error: null, status: 200 });
  const invalidate = jest.spyOn(qc, 'invalidateQueries');
  await render(
    <QueryClientProvider client={qc}>
      <SafeAreaProvider initialMetrics={METRICS}>
        <ThemeProvider>
          <FontScaleProvider>
            <RegularStep mode="stepper" onReadyChange={() => undefined} />
          </FontScaleProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </QueryClientProvider>
  );
  await waitFor(() => expect(screen.getByLabelText('Clear “Not regular” for Gym')).toBeTruthy());
  expect(screen.getByLabelText('Mark Gym as not regular').props.accessibilityState.disabled).toBe(true);
  await fireEvent.press(screen.getByLabelText('Clear “Not regular” for Gym'));
  await waitFor(() => expect(screen.queryByLabelText('Clear “Not regular” for Gym')).toBeNull());
  expect(screen.getByLabelText('Mark Gym as not regular').props.accessibilityState.disabled).toBe(false);
  expect(screen.getByLabelText('Mark Gym as regular').props.accessibilityState.disabled).toBe(false);
  expect(screen.getByLabelText('Mark Gym as not regular').props.accessibilityState.selected).toBe(false);
  expect(screen.getAllByText('Not marked').length).toBeGreaterThan(0);
  expect(qc.getQueryData<RecurringDismissalRow[]>(KEY)?.find((r) => r.id === 'dis-1')).toBeUndefined();
  await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: KEY }));
});
