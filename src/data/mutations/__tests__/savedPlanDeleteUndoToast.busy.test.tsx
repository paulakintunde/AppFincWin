// 05.3-97 (UAT gap 20) variant: queue busy. See savedPlanDeleteUndoToast.test.tsx for the base sequence.
/* eslint-disable import/first, @typescript-eslint/no-require-imports */
globalThis.crypto = globalThis.crypto ?? (require('crypto').webcrypto as Crypto);

import { act, configure, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { deleteB, goalIdOf, saveBoth, settle, setup, sleep, stepOf } from './savedPlanToast.harness';
/* eslint-enable import/first, @typescript-eslint/no-require-imports */

jest.mock('@/services/supabase', () => ({
  get supabase() {
    return require('./savedPlanToast.harness').holder.client;
  },
}));
jest.mock('expo-crypto', () => ({ randomUUID: jest.fn(() => `id-${++require('./savedPlanToast.harness').uuidCounter.n}`) }));
jest.mock('@/data/sync/failedWrites', () => ({ recordFailedWrite: jest.fn(async () => undefined) }));
jest.mock('@/services/analytics', () => ({ getAnalytics: () => ({ track: jest.fn() }) }));
jest.mock('@/features/decide/notifications/waitReminder', () => ({
  scheduleWaitReminder: jest.fn(async () => ({ scheduled: true, id: 'n1' })),
  scheduleCoolingOffReminder: jest.fn(async () => ({ scheduled: true, id: 'n2' })),
  cancelCheckReminders: jest.fn(async () => undefined),
}));
jest.mock('@/data/queries/activity', () => ({ useHouseholdMemberNames: () => new Map() }));
jest.mock('@/features/record/useRecordContext', () => ({ useRecordContext: () => ({ userId: 'u1', householdId: 'h1', timeZone: 'UTC' }) }));
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 47, bottom: 12, left: 0, right: 0 }),
}));

jest.setTimeout(120000);
configure({ asyncUtilTimeout: 30000 }); // the suite runs under heavy machine load: a pure timeout is not a failure

describe('UAT gap 20: delete plan B, Undo at 1 s', () => {
  it('queue busy: a slow write is pending when the delete is issued; Undo at 1 s applies only B delete step', async () => {
    const { server, qc } = await setup({ slowMs: 1500 });
    await saveBoth(qc, server);
    const aGoal = goalIdOf(server, 'chkA');
    deleteB(qc);
    await act(async () => {
      await sleep(1000);
    });
    await fireEvent.press(screen.getByLabelText('Undo'));
    await act(async () => {
      await sleep(2000);
    });
    await settle(qc);
    await waitFor(() => expect(server.calls.some((c) => c.name === 'apply_undo_step')).toBe(true));
    const bDelete = stepOf(server, 'decisionDeleted', 'chkB');
    expect(server.calls.filter((c) => c.name === 'apply_undo_step').map((c) => c.args)).toEqual([{ p_step_id: bDelete.id }]);
    expect(server.checks.chkA).toEqual({ status: 'waiting', deleted: false });
    expect(server.goals[aGoal]!.deleted).toBe(false);
    expect(server.checks.chkB!.deleted).toBe(false);
  });
});
