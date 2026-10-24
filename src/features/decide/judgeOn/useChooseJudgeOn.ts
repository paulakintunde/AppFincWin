// D-107: choosing the Judge-on basis. One call does the three things a choice means:
//  1. the device-local choice (shared store), which re-judges the card and every check;
//  2. Worst / Average also write the existing basis_override setting, once and only when it differs (This month writes
//     nothing to settings, so a stored override still governs older code paths);
//  3. the changed-marker rule (user, 2026-10-24): a basis switch is not a data change, so every open check whose state on
//     the basis being left still equals its saved last-seen state is re-baselined to its state on the new basis.
// The re-baseline lands in the checks cache in the same notify batch as the store flip, so no render shows "N changed".
import { useCallback } from 'react';
import { notifyManager, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/data/keys';
import { useMarkCheckSeen } from '@/data/mutations/decideChecks';
import { useUpdateDecideSettings } from '@/data/mutations/decideSettings';
import { useDecideSettings, useDecideSnapshot, useOpenChecks } from '@/data/queries/decide';
import type { DecideCheckRow } from '@/db/decideChecks';
import { useRecordContext } from '@/features/record/useRecordContext';
import type { JudgeOn } from '../hints/decideHints';
import { rebaselineSeen, withJudgeOn } from '../home/homeRowsModel';
import { useJudgeOn } from './judgeOnStore';

export function useChooseJudgeOn(userId: string): { choose(v: JudgeOn): void } {
  const qc = useQueryClient();
  const rc = useRecordContext();
  const householdId = rc.householdId;
  const today = rc.today;
  const { setJudgeOn } = useJudgeOn(userId);
  const snapshot = useDecideSnapshot();
  const openChecks = useOpenChecks(userId, householdId ?? undefined);
  const settings = useDecideSettings(userId);
  const { update } = useUpdateDecideSettings(userId);
  const { markSeen } = useMarkCheckSeen();

  const before = snapshot.result;
  const checks = openChecks.data;
  const basisOverride = settings.data?.basis_override ?? null;

  const choose = useCallback(
    (v: JudgeOn) => {
      // Re-baseline first: it reads the rows as they are now, on the basis being left.
      const after = before === null ? null : withJudgeOn(before, v);
      const moves = checks === undefined ? [] : rebaselineSeen(before, after, checks, today);
      const byId = new Map(moves.map((m) => [m.id, m.state] as const));
      for (const row of checks ?? []) {
        const state = byId.get(row.id);
        if (state !== undefined) markSeen(row, state, row.last_seen_basis ?? 'logged_months');
      }

      if ((v === 'worst' || v === 'average') && basisOverride !== v) update({ basis_override: v });

      notifyManager.batch(() => {
        // The queued write patches the cache a tick later; patch it now so the first render on the new basis already agrees.
        if (householdId !== null && byId.size > 0) {
          qc.setQueryData<DecideCheckRow[]>(queryKeys.decideChecks(userId, householdId), (rows) =>
            rows?.map((r) => {
              const state = byId.get(r.id);
              return state === undefined ? r : { ...r, last_seen_state: state, last_seen_basis: r.last_seen_basis ?? 'logged_months' };
            })
          );
        }
        // Scheduled after the cache notifications above, so React sees both changes in one render.
        notifyManager.schedule(() => setJudgeOn(v));
      });
    },
    [before, checks, today, basisOverride, update, markSeen, qc, householdId, userId, setJudgeOn]
  );

  return { choose };
}
