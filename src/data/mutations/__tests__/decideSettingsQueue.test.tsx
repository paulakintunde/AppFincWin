// 05.3-117 (UAT gap 35, cache part): both decide_settings mutations (setup steps, plain settings) share one
// queue of pending changes. A save that succeeds re-applies the changes still queued behind it, of either kind,
// so a new own option (a queued custom_options patch) does not vanish from the cache when an earlier save lands.
/* eslint-disable import/first, @typescript-eslint/no-require-imports */
globalThis.crypto = globalThis.crypto ?? (require('crypto').webcrypto as Crypto);

import React from 'react';
import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import { EMPTY_DECIDE_SETTINGS, type DecideSettingsPatch, type DecideSettingsRow } from '@/db/decideSettings';
import { mutationKeys, queryKeys } from '@/data/keys';
import type { WipeHandler } from '@/services/storage/wipe';
import { registerDecideSettingsMutations, useUpdateDecideSettings } from '../decideSettings';
import { registerDecideSetupMutations, useSaveSetupStep } from '../decideSetup';
import { confirmedSettings, isOldestQueued, queuedSettingsPatches, withQueued } from '../decideSettingsQueue';
/* eslint-enable import/first, @typescript-eslint/no-require-imports */

interface ServerCall {
  patch: DecideSettingsPatch;
  resolve(row: DecideSettingsRow): void;
  reject(err: unknown): void;
}

const mockServer: ServerCall[] = [];

jest.mock('@/db/decideSettings', () => ({
  ...jest.requireActual('@/db/decideSettings'),
  upsertDecideSettings: jest.fn(
    (_client: unknown, _userId: string, patch: unknown) =>
      new Promise((resolve, reject) => {
        mockServer.push({ patch: patch as never, resolve, reject });
      })
  ),
}));
jest.mock('../writeClient', () => ({ writeClient: jest.fn(async () => ({})) }));
jest.mock('../undoCapture', () => ({
  ...jest.requireActual('../undoCapture'),
  recordUndoStepSafely: jest.fn(async () => undefined),
}));
jest.mock('@/data/sync/failedWrites', () => ({ recordFailedWrite: jest.fn(async () => undefined) }));
// Built inside the factory: the mutation modules register their handlers while the imports above are hoisted.
jest.mock('@/services/storage/wipe', () => {
  const handlers: WipeHandler[] = [];
  return {
    handlers,
    registerWipeHandler: jest.fn((h: WipeHandler) => {
      handlers.push(h);
      return () => undefined;
    }),
  };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { recordFailedWrite } = require('@/data/sync/failedWrites') as { recordFailedWrite: jest.Mock };
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { handlers: mockWipeHandlers } = require('@/services/storage/wipe') as { handlers: WipeHandler[] };

let seq = 0;
let USER = 'q-user-0';
let KEY = queryKeys.decideSettings(USER);

const row = (overrides: Partial<DecideSettingsRow> = {}): DecideSettingsRow => ({
  ...EMPTY_DECIDE_SETTINGS,
  id: 'set-1',
  user_id: USER,
  version: 1,
  ...overrides,
});

const OPTION = { items: [{ id: 'own-1', label: 'Bike parts' }] } as unknown as Record<string, unknown>;

function wrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

async function setup() {
  seq += 1;
  USER = `q-user-${seq}`;
  KEY = queryKeys.decideSettings(USER);
  mockServer.length = 0;
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  registerDecideSettingsMutations(qc);
  registerDecideSetupMutations(qc);
  qc.setQueryData(KEY, row({ reserve: 100 }));
  const { result } = await renderHook(
    () => ({ settings: useUpdateDecideSettings(USER), setup: useSaveSetupStep(USER) }),
    { wrapper: wrapper(qc) }
  );
  return { qc, hooks: result };
}

const cached = (qc: QueryClient) => qc.getQueryData<DecideSettingsRow>(KEY);

beforeEach(() => {
  onlineManager.setOnline(true);
  recordFailedWrite.mockClear();
});

describe('queued decide_settings changes across both mutation kinds', () => {
  it('regression: an earlier settings save succeeding keeps a queued setup step (own option) in the cache', async () => {
    const { qc, hooks } = await setup();
    hooks.current.settings.update({ everyday_override: 100 });
    hooks.current.setup.save({ patch: { custom_options: OPTION } });
    await waitFor(() => expect(mockServer).toHaveLength(1)); // B waits behind A in WRITE_SCOPE
    expect(cached(qc)).toMatchObject({ everyday_override: 100, custom_options: OPTION });

    mockServer[0]!.resolve(row({ reserve: 100, everyday_override: 100, version: 2 }));
    await waitFor(() => expect(mockServer).toHaveLength(2));
    expect(cached(qc)).toMatchObject({ everyday_override: 100, custom_options: OPTION, version: 2 });

    mockServer[1]!.resolve(row({ reserve: 100, everyday_override: 100, custom_options: OPTION, version: 3 }));
    await waitFor(() => expect(cached(qc)?.version).toBe(3));
    expect(cached(qc)).toEqual(row({ reserve: 100, everyday_override: 100, custom_options: OPTION, version: 3 }));
  });

  it('the same with the kinds swapped: a setup step succeeding keeps a queued settings save', async () => {
    const { qc, hooks } = await setup();
    hooks.current.setup.save({ patch: { custom_options: OPTION } });
    hooks.current.settings.update({ everyday_override: 100 });
    await waitFor(() => expect(mockServer).toHaveLength(1));

    mockServer[0]!.resolve(row({ reserve: 100, custom_options: OPTION, version: 2 }));
    await waitFor(() => expect(mockServer).toHaveLength(2));
    expect(cached(qc)).toMatchObject({ everyday_override: 100, custom_options: OPTION, version: 2 });
  });

  it('with nothing queued, a success writes exactly the server row', async () => {
    const { qc, hooks } = await setup();
    hooks.current.settings.update({ everyday_override: 100 });
    await waitFor(() => expect(mockServer).toHaveLength(1));
    const server = row({ reserve: 100, everyday_override: 100, version: 2 });
    mockServer[0]!.resolve(server);
    await waitFor(() => expect(cached(qc)?.version).toBe(2));
    expect(cached(qc)).toEqual(server);
  });

  it('a settings save that succeeded, then a refused setup step, rolls back to the server row of that save', async () => {
    const { qc, hooks } = await setup();
    hooks.current.settings.update({ everyday_override: 100 });
    hooks.current.setup.save({ patch: { custom_options: OPTION } });
    hooks.current.settings.update({ reserve: 300 });
    await waitFor(() => expect(mockServer).toHaveLength(1));
    const r1 = row({ reserve: 100, everyday_override: 100, version: 2 });
    mockServer[0]!.resolve(r1);
    await waitFor(() => expect(mockServer).toHaveLength(2));

    let atFailure: DecideSettingsRow | undefined;
    recordFailedWrite.mockImplementationOnce(async () => {
      atFailure = cached(qc);
    });
    mockServer[1]!.reject(new Error('refused'));
    await waitFor(() => expect(recordFailedWrite).toHaveBeenCalledTimes(1));
    // R1 (A's change kept) plus the still-queued reserve save; the refused option left.
    expect(atFailure).toEqual({ ...r1, reserve: 300 });
    expect(confirmedSettings.get(USER)).toEqual(r1);
  });

  it('queuedSettingsPatches lists both kinds for this user only, oldest first, without the excluded vars', async () => {
    const { qc, hooks } = await setup();
    hooks.current.settings.update({ everyday_override: 100 });
    hooks.current.setup.save({ patch: { custom_options: OPTION } });
    hooks.current.settings.update({ reserve: 300 });
    // A second user's queued edit never shows up in this user's list.
    qc.getMutationCache()
      .build(qc, { mutationKey: mutationKeys.updateDecideSettings })
      .execute({ userId: 'someone-else', patch: { reserve: 1 } })
      .catch(() => undefined);
    await waitFor(() => expect(mockServer).toHaveLength(1));

    expect(queuedSettingsPatches(qc, USER, undefined)).toEqual([
      { everyday_override: 100 },
      { custom_options: OPTION },
      { reserve: 300 },
    ]);
    const first = qc.getMutationCache().findAll({ status: 'pending' })[0]!.state.variables;
    expect(queuedSettingsPatches(qc, USER, first)).toEqual([{ custom_options: OPTION }, { reserve: 300 }]);
  });

  it('isOldestQueued spans both keys in creation order', async () => {
    const { qc, hooks } = await setup();
    hooks.current.settings.update({ everyday_override: 100 });
    hooks.current.setup.save({ patch: { custom_options: OPTION } });
    await waitFor(() => expect(mockServer).toHaveLength(1));
    const settingsVars = qc.getMutationCache().findAll({ mutationKey: mutationKeys.updateDecideSettings })[0]!.state
      .variables as { userId: string };
    const setupVars = qc.getMutationCache().findAll({ mutationKey: mutationKeys.updateDecideSetup })[0]!.state
      .variables as { userId: string };
    expect(isOldestQueued(qc, settingsVars)).toBe(true);
    expect(isOldestQueued(qc, setupVars)).toBe(false);
  });

  it('withQueued layers patches over the row in order', () => {
    const base = row({ reserve: 1 });
    expect(withQueued(base, [])).toBe(base);
    expect(withQueued(base, [{ reserve: 2 }, { reserve: 3, everyday_override: 4 }])).toEqual({
      ...base,
      reserve: 3,
      everyday_override: 4,
    });
  });

  it('one shared confirmed-row map, cleared by its one wipe handler', async () => {
    const ids = mockWipeHandlers.map((h) => h.id);
    expect(ids).toContain('decide-settings-confirmed');
    expect(ids).not.toContain('decide-setup-confirmed');
    confirmedSettings.set('x', null);
    await mockWipeHandlers.find((h) => h.id === 'decide-settings-confirmed')!.wipe();
    expect(confirmedSettings.size).toBe(0);
  });
});
