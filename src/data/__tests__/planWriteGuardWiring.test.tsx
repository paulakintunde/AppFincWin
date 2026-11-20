// 09-25 (A2-W): the central plan guard on the app's real QueryClient and registered mutation defaults. In sample (and
// locked) a write to a locked table opens the sheet, sends nothing, queues nothing, changes no cache and keeps nothing.
/* eslint-disable import/first, @typescript-eslint/no-require-imports */
globalThis.crypto = globalThis.crypto ?? (require('crypto').webcrypto as Crypto);

import React from 'react';
import { Pressable, Text } from 'react-native';
import { MutationObserver, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { mutationKeys, queryKeys } from '@/data/keys';
import { queryClient } from '@/data/queryClient';
import { registerMutationDefaults } from '@/data/mutations';
import { useUpdateDecideSettings } from '@/data/mutations/decideSettings';
import {
  PlanWriteBlockedError,
  setPlanWriteBlockedListener,
  setPlanWriteState,
} from '@/data/sync/planWriteGuard';
import { getToast, resetToastForTests, showToast } from '@/state/undoToast';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { LockedSheetProvider } from '@/features/plans/lockedSheetContext';
/* eslint-enable import/first, @typescript-eslint/no-require-imports */

jest.setTimeout(60000);

// Any touch of the Supabase client is a sent write.
const mockSupabaseTouches: string[] = [];
jest.mock('@/services/supabase', () => ({
  get supabase() {
    return new Proxy(
      {},
      {
        get(_t, prop) {
          mockSupabaseTouches.push(String(prop));
          return () => {
            throw new Error('network');
          };
        },
      },
    );
  },
}));
jest.mock('@/db/session', () => ({ assertSession: jest.fn(async () => undefined) }));
jest.mock('@sentry/react-native', () => ({ addBreadcrumb: jest.fn() }));
jest.mock('@/data/sync/failedWrites', () => ({ recordFailedWrite: jest.fn(async () => undefined) }));
jest.mock('@/data/sync/lockedWrites', () => ({ recordLockedWrite: jest.fn(async () => undefined) }));
jest.mock('@/ui/Sheet', () => {
  const { View } = require('react-native');
  return { Sheet: ({ visible, children }: { visible: boolean; children: React.ReactNode }) => (visible ? <View>{children}</View> : null) };
});
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('@/ui/haptics', () => ({ hapticTap: jest.fn() }));

const { recordFailedWrite } = require('@/data/sync/failedWrites') as { recordFailedWrite: jest.Mock };
const { recordLockedWrite } = require('@/data/sync/lockedWrites') as { recordLockedWrite: jest.Mock };

registerMutationDefaults(queryClient);

const SAMPLE = { status: 'sample', writable: false, loading: false };
const LOCKED = { status: 'locked', writable: false, loading: false };

beforeEach(() => {
  mockSupabaseTouches.length = 0;
  recordFailedWrite.mockClear();
  recordLockedWrite.mockClear();
  queryClient.getMutationCache().clear();
  queryClient.clear();
});
afterEach(() => {
  setPlanWriteState(null);
  setPlanWriteBlockedListener(null);
});

// Representative writes per area. Variables are never read: the guard stops the write before its own onMutate.
const AREAS: [string, readonly unknown[]][] = [
  ['Decide settings (safety net amount)', mutationKeys.updateDecideSettings],
  ['Decide check delete / edit', mutationKeys.editCheck],
  ['income profile save (Save pay details)', mutationKeys.updateDecideSetup],
  ['pay bill (mark paid)', mutationKeys.editTransaction],
  ['Grow debt edit', mutationKeys.saveGrowDebt],
  ['Grow payoff plan change', mutationKeys.saveDebtPlan],
  ['Grow goal edit', mutationKeys.editGoal],
  ['Grow holding edit', mutationKeys.editHolding],
];

describe.each([
  ['sample', SAMPLE],
  ['locked', LOCKED],
] as const)('central guard in %s', (variant, plan) => {
  it.each(AREAS)('%s: opens the sheet and sends, queues and keeps nothing', async (_area, key) => {
    const listener = jest.fn();
    setPlanWriteBlockedListener(listener);
    setPlanWriteState(plan);
    const before = { kept: 'as is' };
    queryClient.setQueryData(['probe'], before);

    const observer = new MutationObserver<unknown, Error, unknown>(queryClient, { mutationKey: key });
    await expect(observer.mutate({ id: 'x', userId: 'u1', patch: {} })).rejects.toBeInstanceOf(PlanWriteBlockedError);

    expect(listener).toHaveBeenCalledWith(variant);
    expect(mockSupabaseTouches).toEqual([]);
    expect(recordFailedWrite).not.toHaveBeenCalled();
    expect(recordLockedWrite).not.toHaveBeenCalled();
    const pending = queryClient.getMutationCache().getAll().filter((m) => m.state.status === 'pending' || m.state.isPaused);
    expect(pending).toHaveLength(0);
    expect(queryClient.getQueryData(['probe'])).toBe(before);
  });
});

it('an open write (user setup) still runs in sample', async () => {
  setPlanWriteState(SAMPLE);
  const listener = jest.fn();
  setPlanWriteBlockedListener(listener);
  const observer = new MutationObserver<unknown, Error, unknown>(queryClient, { mutationKey: mutationKeys.saveUserSetup });
  await observer.mutate({ userId: 'u1', patch: {} }).catch(() => undefined);
  expect(listener).not.toHaveBeenCalled();
  expect(mockSupabaseTouches.length).toBeGreaterThan(0); // it reached the client
});

it('a write while the plan is still loading is not blocked', async () => {
  setPlanWriteState({ status: 'sample', writable: false, loading: true });
  const listener = jest.fn();
  setPlanWriteBlockedListener(listener);
  const observer = new MutationObserver<unknown, Error, unknown>(queryClient, { mutationKey: mutationKeys.updateDecideSettings });
  await observer.mutate({ userId: 'u1', patch: {} }).catch(() => undefined);
  expect(listener).not.toHaveBeenCalled();
});

function SaveButton() {
  const { update } = useUpdateDecideSettings('u1');
  return (
    <Pressable
      testID="save"
      onPress={() => {
        update({ rough_income: 100 });
        showToast({ kind: 'ordinary', text: { key: 'lock.savedOffline.synced' } }); // a screen's own "saved" toast
      }}
    >
      <Text>Save</Text>
    </Pressable>
  );
}

it('a screen that skipped its button gate: the sheet opens, the cache is untouched and its toast is taken down', async () => {
  resetToastForTests();
  setPlanWriteState(SAMPLE);
  const settingsBefore = { user_id: 'u1', rough_income: 5 };
  queryClient.setQueryData(queryKeys.decideSettings('u1'), settingsBefore);
  const screen = await render(
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <LockedSheetProvider>
          <SaveButton />
        </LockedSheetProvider>
      </ThemeProvider>
    </QueryClientProvider>,
  );
  await fireEvent.press(screen.getByTestId('save'));
  await waitFor(() => expect(screen.getByText('That needs your own records')).toBeTruthy());
  await waitFor(() => expect(getToast()).toBeNull());
  expect(queryClient.getQueryData(queryKeys.decideSettings('u1'))).toBe(settingsBefore);
  expect(mockSupabaseTouches).toEqual([]);
});
