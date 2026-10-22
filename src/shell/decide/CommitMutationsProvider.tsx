// 05-29 (D-09..D-11): supplies the Go ahead / Wait / Pass writes to the check flow, which may not import them itself
// (depcruise fx-fetch-never-from-reads). Mounted by app/(app)/decide/check/[id].tsx.
import React, { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { buildGoAheadWrite, isGoAheadRefusal, useGoAhead } from '@/data/mutations/decideGoAhead';
import { usePass, useWaitAndSave } from '@/data/mutations/decideOutcome';
import { CommitMutationsContext, type CommitMutations } from '@/features/decide/check/commitMutations';
import { captureError } from '@/services/errors/errorReporter';

let dryRunId = 0;
const dryMint = (): string => `dry-run-${++dryRunId}`;

/**
 * WR-D11: a dry run of the Go ahead build. A refusal the builder throws on purpose means "cannot write"; anything else is
 * a bug, which is reported rather than hidden behind the "can't write" copy (it still answers false, since canWrite runs
 * while the screen renders).
 */
export function dryRunGoAhead(args: Parameters<CommitMutations['canWrite']>[0]): boolean {
  try {
    buildGoAheadWrite({ ...args, mint: dryMint });
    return true;
  } catch (error) {
    if (!isGoAheadRefusal(error)) captureError(error, { area: 'ui' });
    return false;
  }
}

export function CommitMutationsProvider({ children }: { children: ReactNode }) {
  const go = useGoAhead();
  const wait = useWaitAndSave();
  const pass = usePass();
  // WR-D11: the hooks hand back new objects on every render, so the context value reads them through a ref and stays the
  // same object: consumers and their memos are not invalidated by an unrelated re-render.
  const latest = useRef({ go, wait, pass });
  useEffect(() => {
    latest.current = { go, wait, pass };
  });
  const value = useMemo<CommitMutations>(
    () => ({
      goAhead: (args) => latest.current.go.goAhead(args),
      canWrite: dryRunGoAhead,
      waitAndSave: (args) => latest.current.wait.save(args),
      pass: (args) => latest.current.pass.pass(args),
    }),
    []
  );
  return <CommitMutationsContext.Provider value={value}>{children}</CommitMutationsContext.Provider>;
}
