// 05-29 (D-09..D-11): supplies the Go ahead / Wait / Pass writes to the check flow, which may not import them itself
// (depcruise fx-fetch-never-from-reads). Mounted by app/(app)/decide/check/[id].tsx.
import React, { type ReactNode } from 'react';
import { buildGoAheadWrite, useGoAhead } from '@/data/mutations/decideGoAhead';
import { usePass, useWaitAndSave } from '@/data/mutations/decideOutcome';
import { CommitMutationsContext, type CommitMutations } from '@/features/decide/check/commitMutations';

let dryRunId = 0;
const dryMint = (): string => `dry-run-${++dryRunId}`;

export function CommitMutationsProvider({ children }: { children: ReactNode }) {
  const go = useGoAhead();
  const wait = useWaitAndSave();
  const pass = usePass();
  const value: CommitMutations = {
    goAhead: (args) => go.goAhead(args),
    canWrite: (args) => {
      try {
        buildGoAheadWrite({ ...args, mint: dryMint });
        return true;
      } catch {
        return false;
      }
    },
    waitAndSave: (args) => wait.save(args),
    pass: (args) => pass.pass(args),
  };
  return <CommitMutationsContext.Provider value={value}>{children}</CommitMutationsContext.Provider>;
}
