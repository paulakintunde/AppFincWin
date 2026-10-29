/**
 * Plan 05.2-28 (DSU-10): the data behind the Unspent money card, sheet and step. Reads the engine through useDecideV3 and
 * writes through plan 13's useSaveSetupStep. Every confirm is a new anchor (unspent_anchor + unspent_anchor_at today);
 * Clear sets both back to null. Each write is one undo step.
 */
import { useMemo } from 'react';
import { unspentSum, type UnspentSum } from '@/engine/decide/v3';
import { useSaveSetupStep } from '@/data/mutations/decideSetup';
import { useDecideSettings } from '@/data/queries/decide';
import { useDecideV3 } from '@/data/queries/decideV3';
import { useRecordContext } from '@/features/record/useRecordContext';
import { toStoredAnchor, unspentStateOf, unspentSumLines, type UnspentSumLines, type UnspentView } from './unspentView';

export interface UnspentModel {
  /** False while the engine inputs are still loading. */
  ready: boolean;
  sum: UnspentSum | null;
  lines: UnspentSumLines | null;
  view: UnspentView | null;
  currency: string;
  /** The engine's own as-of date. */
  today: string | null;
  /** The figure stored now, in display units, or null when nothing is confirmed. */
  hasAnchor: boolean;
  /** Saves `display` (the figure the user read) as a new anchor dated today. Null when nothing changed. */
  confirm(display: number): { stepId: string } | null;
  /** Sets the anchor back to Not confirmed. Null when it already is. */
  clear(): { stepId: string } | null;
}

export function useUnspent(): UnspentModel {
  const rc = useRecordContext();
  const userId = rc.userId ?? '';
  const settings = useDecideSettings(rc.userId ?? undefined).data ?? null;
  const v3 = useDecideV3();
  const saver = useSaveSetupStep(userId);

  const { inputs, evaluation } = v3;
  const sum = useMemo(() => (inputs !== null && evaluation !== null ? unspentSum(inputs, evaluation.month) : null), [inputs, evaluation]);
  const lines = useMemo(() => (sum === null ? null : unspentSumLines(sum)), [sum]);
  const view = useMemo(
    () => (sum !== null && evaluation !== null && inputs !== null ? unspentStateOf(evaluation, sum, inputs.asOf) : null),
    [sum, evaluation, inputs]
  );
  const today = inputs?.asOf ?? null;

  return {
    ready: sum !== null && view !== null,
    sum,
    lines,
    view,
    currency: inputs?.currency ?? settings?.currency ?? rc.homeCurrency,
    today,
    hasAnchor: settings !== null && settings.unspent_anchor !== null && settings.unspent_anchor_at !== null,
    confirm(display) {
      if (sum === null || today === null) return null;
      return saver.save({
        labelKey: 'unspentConfirmed',
        patch: { unspent_anchor: toStoredAnchor(display, sum), unspent_anchor_at: today },
      });
    },
    clear() {
      return saver.save({ labelKey: 'unspentCleared', patch: { unspent_anchor: null, unspent_anchor_at: null } });
    },
  };
}
