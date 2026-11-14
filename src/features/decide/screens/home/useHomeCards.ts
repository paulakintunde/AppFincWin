/**
 * 06.1-22: the data behind the Decide home lower cards. useOpenCheckRows judges each open check on the held Prepared (no second
 * prepare) and compares with what the user last saw (changeSinceLooked). useMoneyRules reads and writes the rules (dsr_line and the
 * rules document in custom_options). useRuleCrossings judges every open check with a changed rule, before and after, and names the
 * ones that newly cross it. The bigint-carrying Evaluation never leaves these hooks.
 */
import { useCallback, useMemo } from 'react';
import { useDecideSettings, useOpenChecks } from '@/data/queries/decide';
import { useDecideV3 } from '@/data/queries/decideV3';
import { useSaveSetupStep } from '@/data/mutations/decideSetup';
import type { DecideCheckRow } from '@/db/decideChecks';
import {
  changeSinceLooked,
  judgeCheck,
  prepare,
  readStoredCheck,
  seenOf,
  type Evaluation,
  type LimitLine,
  type Limits,
  type SeenV3,
  type V3Inputs,
} from '@/engine/decide/v3';
import { minorUnits } from '@/engine/money';
import { percent } from '@/engine/payoff';
import { useRecordContext } from '@/features/record/useRecordContext';
import { stateForVerdict } from '../logic/stateForVerdict';
import {
  newlyCrossing,
  ownLinesOf,
  readRulesDoc,
  tightLineOf,
  withRulesDoc,
  type Crossing,
  type JudgedCheck,
  type OpenCheckRowModel,
  type RulesDoc,
} from './homeCardsModel';

const minorOrNull = (n: number | null) => (n === null ? null : minorUnits(n));

function isRec(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

/** The row model for one open check; `evaluation` is today's answer when the engine is ready, else null (the stored answer is used). */
export function openCheckRowOf(row: DecideCheckRow, evaluation: Evaluation | null): OpenCheckRowModel {
  const { check } = readStoredCheck(row.inputs);
  const stored = row.answer_v3;
  const fresh = evaluation === null ? null : changeSinceLooked((stored as SeenV3 | null) ?? null, evaluation.result);
  const seen = fresh?.seen ?? stored;
  const code = seen?.code ?? null;
  const draft = stored === null || code === 'needs_input';
  return {
    id: row.id,
    name: row.name,
    price: check.price,
    date: check.purchaseDate ?? null,
    left: seen?.unspentAfter ?? null,
    code,
    variant: seen?.variant ?? null,
    once: check.pay.mode === 'once',
    draft,
    payNotChosen: draft && !(isRec(row.inputs) && isRec(row.inputs.pay)),
    changed: fresh?.changed === true,
    checkedOn: row.updated_at.slice(0, 10),
    createdOn: row.created_at.slice(0, 10),
  };
}

export function useOpenCheckRows(): { rows: readonly OpenCheckRowModel[]; checks: readonly DecideCheckRow[] } {
  const rc = useRecordContext();
  const open = useOpenChecks(rc.userId ?? undefined, rc.householdId ?? undefined).data;
  const v3 = useDecideV3();
  const prepared = v3.prepared;
  return useMemo(() => {
    const checks = (open ?? []).filter((c) => c.deleted_at === null);
    const rows = checks.map((c) => {
      let evaluation: Evaluation | null = null;
      if (prepared !== null) {
        try {
          evaluation = judgeCheck(prepared, readStoredCheck(c.inputs).check);
        } catch {
          evaluation = null;
        }
      }
      return openCheckRowOf(c, evaluation);
    });
    return { rows, checks };
  }, [open, prepared]);
}

/** The tone an open check's current answer shows (glyph + word source), from the stored code. */
export function toneOfRow(row: OpenCheckRowModel): ReturnType<typeof stateForVerdict> | null {
  if (row.code === null) return null;
  return stateForVerdict(row.code as never, (row.variant ?? null) as never);
}

// ── rules ───────────────────────────────────────────────────────────────────────────────────────────────────────

export interface RulesPatch {
  /** The new debt share as stored text ("30"), null = off. Undefined = untouched. */
  dsrLine?: string | null;
  /** The new rules document. Undefined = untouched. */
  doc?: RulesDoc;
}

export interface MoneyRulesState {
  dsrLine: string | null;
  doc: RulesDoc;
  /** Saves the patch as one Undo step; returns its step id, or null when nothing was written. */
  save(patch: RulesPatch, label: 'ruleAdded' | 'ruleEdited' | 'ruleRemoved'): string | null;
}

export function useMoneyRules(): MoneyRulesState {
  const rc = useRecordContext();
  const userId = rc.userId ?? '';
  const settings = useDecideSettings(rc.userId ?? undefined).data ?? null;
  const setup = useSaveSetupStep(userId);
  const doc = useMemo(() => readRulesDoc(settings?.custom_options), [settings?.custom_options]);
  const save = useCallback(
    (patch: RulesPatch, label: 'ruleAdded' | 'ruleEdited' | 'ruleRemoved'): string | null => {
      if (userId === '') return null;
      const write: Record<string, unknown> = {};
      if (patch.dsrLine !== undefined) write.dsr_line = patch.dsrLine;
      if (patch.doc !== undefined) write.custom_options = withRulesDoc(settings?.custom_options, patch.doc);
      if (Object.keys(write).length === 0) return null;
      return setup.save({ labelKey: label, patch: write })?.stepId ?? null;
    },
    [userId, setup, settings?.custom_options],
  );
  return { dsrLine: settings?.dsr_line ?? null, doc, save };
}

function limitsWith(base: Limits, patch: RulesPatch): Limits {
  let lines: LimitLine[] = [...base.lines];
  if (patch.dsrLine !== undefined) {
    // The legacy debt line: off keeps its place with on = false; on writes the typed share.
    const text = patch.dsrLine;
    lines = lines.map((l) =>
      l.id === 'debt_share' && l.spec.kind === 'debt_share'
        ? { ...l, on: text !== null, spec: text === null ? l.spec : { kind: 'debt_share' as const, pct: percent(text) } }
        : l,
    );
  }
  if (patch.doc !== undefined) {
    lines = lines.filter((l) => l.source !== 'own');
    for (const raw of ownLinesOf(patch.doc)) lines.push(raw as LimitLine);
  }
  return { lines };
}

function judgedOf(checks: readonly DecideCheckRow[], run: (c: DecideCheckRow) => Evaluation | null): JudgedCheck[] {
  const out: JudgedCheck[] = [];
  for (const c of checks) {
    const evaluation = run(c);
    if (evaluation === null) continue;
    const { result } = evaluation;
    out.push({
      checkId: c.id,
      name: c.name,
      lineIds: seenOf(result).lineFacts,
      tone: stateForVerdict(result.code, result.variant).tone,
    });
  }
  return out;
}

/** D49: names the open checks a changed rule newly crosses. Empty while the engine is not ready. */
export function useRuleCrossings(): (patch: RulesPatch) => Crossing[] {
  const v3 = useDecideV3();
  const { checks } = useOpenCheckRows();
  const inputs: V3Inputs | null = v3.inputs;
  return useCallback(
    (patch: RulesPatch): Crossing[] => {
      if (inputs === null || v3.prepared === null) return [];
      const judge = (p: ReturnType<typeof prepare>) => (c: DecideCheckRow) => {
        try {
          return judgeCheck(p, readStoredCheck(c.inputs).check);
        } catch {
          return null;
        }
      };
      const after: V3Inputs = {
        ...inputs,
        limits: limitsWith(inputs.limits, patch),
        tightLine: patch.doc === undefined ? inputs.tightLine : minorOrNull(tightLineOf(patch.doc)),
      };
      return newlyCrossing(judgedOf(checks, judge(v3.prepared)), judgedOf(checks, judge(prepare(after))));
    },
    [inputs, v3.prepared, checks],
  );
}
