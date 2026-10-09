// REC-23, CONTEXT D-09/D-11/D-12: sample figures. seed and clear are online actions -- direct
// awaited RPC calls, never queued -- that report success or failure at once. clear is NOT
// undoable by design (UI-SPEC 11): no undo step is recorded. clear and declinePrompt both record
// that the first-real-save prompt was answered, server-side per user, so it never shows again on
// any device.
import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { clearSampleData, seedSampleData } from '@/db/samples';
import { queryKeys } from '@/data/keys';
import { writeClient } from './writeClient';
import { useUpdateRecordPrefs } from './recordPrefs';

export function useSampleData(ctx: { userId: string; householdId: string; today: string }): {
  seed(): Promise<boolean>;
  clear(): Promise<boolean>;
  declinePrompt(): void;
  pending: boolean;
} {
  const qc = useQueryClient();
  const { markSamplePromptAnswered } = useUpdateRecordPrefs(ctx.userId);
  const [pending, setPending] = useState(false);
  const { userId, householdId, today } = ctx;

  const refresh = useCallback(
    (withUndoLog: boolean): void => {
      void qc.invalidateQueries({ queryKey: queryKeys.accounts(householdId) });
      void qc.invalidateQueries({ queryKey: queryKeys.transactionsRoot(householdId) });
      void qc.invalidateQueries({ queryKey: queryKeys.recurringSeries(householdId) });
      void qc.invalidateQueries({ queryKey: queryKeys.categories(userId) });
      void qc.invalidateQueries({ queryKey: queryKeys.sampleExists(householdId) });
      if (withUndoLog) void qc.invalidateQueries({ queryKey: queryKeys.undoLog(userId) });
    },
    [qc, householdId, userId]
  );

  const seed = useCallback(async (): Promise<boolean> => {
    setPending(true);
    try {
      await seedSampleData(await writeClient(), householdId, today);
      refresh(false);
      return true;
    } catch {
      return false;
    } finally {
      setPending(false);
    }
  }, [householdId, today, refresh]);

  const clear = useCallback(async (): Promise<boolean> => {
    setPending(true);
    try {
      await clearSampleData(await writeClient(), householdId);
      markSamplePromptAnswered();
      refresh(true);
      return true;
    } catch {
      return false;
    } finally {
      setPending(false);
    }
  }, [householdId, markSamplePromptAnswered, refresh]);

  const declinePrompt = useCallback((): void => {
    markSamplePromptAnswered();
  }, [markSamplePromptAnswered]);

  return { seed, clear, declinePrompt, pending };
}
