// 05.3-97 (UAT gap 20): save plan A ($40,000), save plan B ($35), delete B, press the toast's Undo about 1 s later. The
// device undid A's "Plan saved" step instead of B's delete. Real write queue, real mutation registrations and real
// UndoToastHost against a fake server that keeps undo_log rows, so a wrong step id visibly reverts A. The other variants
// live beside this file (.paused, .busy, .sheet): one file each, because the queue and version chains are module state.
/* eslint-disable import/first, @typescript-eslint/no-require-imports */
globalThis.crypto = globalThis.crypto ?? (require('crypto').webcrypto as Crypto);

import { act, configure, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { recordFailedWrite } from '@/data/sync/failedWrites';
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
  it('base: only B delete step is applied; A stays a saved plan; B comes back', async () => {
    const { server, qc } = await setup();
    await saveBoth(qc, server);
    const aGoal = goalIdOf(server, 'chkA');
    deleteB(qc);
    await act(async () => {
      await sleep(300);
    });
    await waitFor(() => expect(server.checks.chkB!.deleted).toBe(true));
    await settle(qc);
    await act(async () => {
      await sleep(1000);
    });
    await fireEvent.press(screen.getByLabelText('Undo'));
    await waitFor(() => expect(server.calls.some((c) => c.name === 'apply_undo_step')).toBe(true));
    await settle(qc);
    const applied = server.calls.filter((c) => c.name === 'apply_undo_step');
    const bDelete = stepOf(server, 'decisionDeleted', 'chkB');
    expect(applied.map((c) => c.args)).toEqual([{ p_step_id: bDelete.id }]);
    expect(server.checks.chkA).toEqual({ status: 'waiting', deleted: false });
    expect(server.goals[aGoal]!.deleted).toBe(false);
    expect(server.checks.chkB!.deleted).toBe(false);
    expect(recordFailedWrite).not.toHaveBeenCalled();
  });
});
