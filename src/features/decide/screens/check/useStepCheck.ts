/**
 * 06.1-19 (D-09, D-24, T-06.1-19-03): the check the big-buy stepper is building. It lives in decide_checks as a draft keyed by the
 * route's id, is read back through readStoredCheck and written through the queued useSaveCheckDraft (debounced, flushed on leaving),
 * so Back, going offline and reopening keep every value. Also here: the step data (region, bills, debts), the kind model and the
 * pure helpers the three steps share. Nothing computed is stored; only typed inputs and the user's own choices.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Href } from 'expo-router';
import type { DecideCheckRow } from '@/db/decideChecks';
import { useSaveCheckDraft } from '@/data/mutations/decideChecks';
import { useCategories } from '@/data/queries/categories';
import { useDebts, useDecideChecks } from '@/data/queries/decide';
import { useDecideV3 } from '@/data/queries/decideV3';
import { DECIDE_READ_STALE_MS } from '@/data/queries/decideStale';
import { readStoredCheck, toStoredV2, type CheckV2, type ItemTypeRef } from '@/engine/decide/v3';
import { perfMark, usePerfMount } from '@/features/decide/perf/perfMarks';
import { useRecordContext } from '@/features/record/useRecordContext';
import { readKind } from '../logic/kindWords';
import { prefillRunningCosts, type PrefillBill, type PrefilledLine } from '../logic/runningCostTemplates';
import type { SaleDebt } from '../sheets/SaleSheet';

export const STEP_DRAFT_DEBOUNCE_MS = 600;

export type StepNumber = 1 | 2 | 3;
export type BuiltInKind = 'everyday' | 'tech' | 'car' | 'home' | 'other';
export type StepKind = 'everyday' | 'tech' | 'car' | 'home' | 'other' | `own:${string}`;
export type CountsLike = 'everyday' | 'tech' | 'car' | 'other';
export interface OwnKind {
  id: string;
  name: string;
  countsLike: CountsLike;
}

/** Answer keys carry a layer prefix or the parser drops them (layerOfAnswerKey); these belong to the always-visible layer. */
export const KEY_KIND = 'L0.kind';
export const KEY_OWN_KINDS = 'L0.own_kinds';
export const KEY_VISITED = 'L0.visited_steps';
export const KEY_SKIPPED = 'L0.skipped_steps';
export const KEY_PREFILL = 'L0.prefill_sources';
export const KEY_ONE_OFFS = 'L0.one_offs';
/** Names of the lines the user added (a RunningCostLine and a StoppedCost carry no name), by line id. */
export const KEY_NAMES = 'L0.line_names';

export interface OneOffCost {
  id: string;
  name: string;
  amount: number;
}

const STEP_PATH = { 1: '/decide/check/kind', 2: '/decide/check/price', 3: '/decide/check/costs' } as const;

export function stepHref(step: StepNumber, id: string, dir: 'fwd' | 'back' = 'fwd'): Href {
  return { pathname: STEP_PATH[step], params: { id, dir } } as unknown as Href;
}

const isRecord = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

export function ownKindsOf(check: CheckV2): OwnKind[] {
  const raw = check.layerAnswers[KEY_OWN_KINDS];
  if (!Array.isArray(raw)) return [];
  return raw.filter((k): k is OwnKind => isRecord(k) && typeof k.id === 'string' && typeof k.name === 'string' && typeof k.countsLike === 'string');
}

export function lineNamesOf(check: CheckV2): Record<string, string> {
  const raw = check.layerAnswers[KEY_NAMES];
  if (!isRecord(raw)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) if (typeof v === 'string') out[k] = v;
  return out;
}

export function oneOffsOf(check: CheckV2): OneOffCost[] {
  const raw = check.layerAnswers[KEY_ONE_OFFS];
  if (!Array.isArray(raw)) return [];
  return raw.filter((k): k is OneOffCost => isRecord(k) && typeof k.id === 'string' && typeof k.name === 'string' && typeof k.amount === 'number');
}

/** The kind picked on step 1, else what the words read as, else null. */
export function kindOf(check: CheckV2, name: string): StepKind | null {
  const stored = check.layerAnswers[KEY_KIND];
  if (typeof stored === 'string' && stored.length > 0) return stored as StepKind;
  const words = readKind(name);
  return words === null ? null : words;
}

/** What a kind counts like for questions and running costs: an own kind borrows from the kind it counts like. */
export function countsLikeOf(kind: StepKind | null, check: CheckV2): CountsLike | 'home' | null {
  if (kind === null) return null;
  if (kind.startsWith('own:')) return ownKindsOf(check).find((k) => `own:${k.id}` === kind)?.countsLike ?? 'other';
  return kind as CountsLike | 'home';
}

function itemTypeFor(like: CountsLike | 'home' | null): ItemTypeRef {
  if (like === 'car') return { kind: 'preset', value: 'vehicle' };
  if (like === 'home') return { kind: 'preset', value: 'property' };
  if (like === 'tech') return { kind: 'preset', value: 'electronics' };
  return { kind: 'preset', value: 'general' };
}

export function withKind(check: CheckV2, kind: StepKind): CheckV2 {
  return { ...check, itemType: itemTypeFor(countsLikeOf(kind, check)), layerAnswers: { ...check.layerAnswers, [KEY_KIND]: kind } };
}

/** The step the stepper opens on: the kind step is skipped when the words already read as a kind that is not Home (D-02). */
export function firstStepFor(check: CheckV2, name: string): StepNumber {
  const stored = check.layerAnswers[KEY_KIND];
  const words = readKind(name);
  return typeof stored !== 'string' && words !== null && words !== 'home' ? 2 : 1;
}

export interface StepData {
  currency: string;
  today: string;
  country: string | null;
  subdivision: string | null;
  bills: PrefillBill[];
  /** For the "costs that stop" bill list. */
  billChoices: { id: string; name: string }[];
  categories: { id: string; name: string }[];
  debts: SaleDebt[];
  status: 'loading' | 'error' | 'ready';
}

export function useStepData(): StepData {
  const rc = useRecordContext();
  const v3 = useDecideV3();
  // 06.1-72 (G-73-1): held fresh like the rest of Decide's reads, so a step or the answer mounting does not refetch them.
  const cats = useCategories(rc.userId ?? undefined, { staleTime: DECIDE_READ_STALE_MS }).data;
  const debtRows = useDebts(rc.householdId ?? undefined, { staleTime: DECIDE_READ_STALE_MS }).data;
  const inputs = v3.inputs;
  return useMemo<StepData>(() => {
    const categories = (cats ?? []).map((c) => ({ id: c.id, name: c.name ?? '' }));
    const nameOf = new Map(categories.map((c) => [c.id, c.name]));
    const live = (inputs?.series ?? []).filter((s) => s.role === 'bill' && s.status === 'live');
    const bills: PrefillBill[] = live.map((s) => {
      const every = s.cadence.unit === 'month' && (s.cadence.every === 1 || s.cadence.every === 3 || s.cadence.every === 12) ? s.cadence.every : null;
      return { id: s.id, name: s.name ?? '', categoryName: s.categoryId === null ? null : (nameOf.get(s.categoryId) ?? null), amount: s.amount, everyMonths: every };
    });
    const billChoices = live.map((s) => ({ id: s.id, name: s.name ?? (s.categoryId === null ? '' : (nameOf.get(s.categoryId) ?? '')) })).filter((b) => b.name !== '');
    const names = new Map((debtRows ?? []).map((d) => [d.id, d.name]));
    const debts: SaleDebt[] = (inputs?.debts ?? []).map((d) => ({ id: d.id, name: names.get(d.id) ?? '', balance: d.balance })).filter((d) => d.name !== '');
    return {
      currency: inputs?.currency ?? rc.homeCurrency,
      today: rc.today,
      country: inputs?.region ?? rc.region,
      subdivision: inputs?.regionSubdivision ?? null,
      bills,
      billChoices,
      categories,
      debts,
      status: v3.status,
    };
  }, [cats, debtRows, inputs, rc.homeCurrency, rc.today, rc.region, v3.status]);
}

/** Starts the car's running costs from records or the dated table, once. Later edits and switches stay as the user left them. */
export function withPrefill(check: CheckV2, name: string, data: Pick<StepData, 'bills' | 'country' | 'currency' | 'today'>): { check: CheckV2; lines: PrefilledLine[] } {
  const like = countsLikeOf(kindOf(check, name), check);
  if (check.runningCosts !== undefined || like !== 'car') return { check, lines: [] };
  const lines = prefillRunningCosts({ kind: 'car', country: data.country, currency: data.currency, bills: data.bills, start: data.today });
  const sources: Record<string, string> = {};
  for (const l of lines) sources[l.key] = l.source;
  return { check: { ...check, runningCosts: lines.map((l) => l.line), layerAnswers: { ...check.layerAnswers, [KEY_PREFILL]: sources } }, lines };
}

export interface StepCheck {
  status: 'loading' | 'ready' | 'not_found';
  check: CheckV2 | null;
  name: string;
  update(next: CheckV2 | ((c: CheckV2) => CheckV2)): void;
  /** Writes the held edit now (leaving a step, or finishing). */
  flush(): void;
  /** Marks a step as seen; steps never marked are written as skipped when the stepper finishes. */
  markVisited(step: StepNumber): void;
  /** Writes which steps were never visited and saves, so the answer can say what was pre-filled and not checked. */
  finish(from: StepNumber, prepare?: (c: CheckV2) => CheckV2): void;
}

/** `fallbackRow` is a check that exists only optimistically (just created, not yet in the list); the stored row wins once it arrives. */
export function useStepCheck(id: string, fallbackRow: DecideCheckRow | null = null): StepCheck {
  usePerfMount('step.mount'); // 06.1-72: perf builds only
  const rc = useRecordContext();
  const checks = useDecideChecks(rc.userId ?? undefined, rc.householdId ?? undefined);
  const { save } = useSaveCheckDraft();
  const row = useMemo(() => checks.data?.find((r) => r.id === id) ?? fallbackRow, [checks.data, id, fallbackRow]);
  const base = useMemo(() => (row === null ? null : readStoredCheck(row.inputs).check), [row]);
  const [edited, setEdited] = useState<CheckV2 | null>(null);
  const check = edited ?? base;

  const held = useRef<CheckV2 | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const live = useRef({ row, save });
  useEffect(() => {
    live.current = { row, save };
  });

  const flush = useCallback((): void => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    const next = held.current;
    const { row: current, save: doSave } = live.current;
    if (next === null || current === null) return;
    held.current = null;
    perfMark('step.flush:start'); // 06.1-72: perf builds only
    doSave({ id, name: current.name, inputs: toStoredV2(next) as Record<string, unknown>, furthestStep: current.furthest_step });
    perfMark('step.flush:end');
  }, [id]);

  // Edits apply to this ref at once (not inside a state updater), so two edits in one event and a flush right after both see the latest.
  const latest = useRef<CheckV2 | null>(null);
  const update = useCallback(
    (next: CheckV2 | ((c: CheckV2) => CheckV2)): void => {
      const from = latest.current ?? base;
      if (from === null) return;
      const value = typeof next === 'function' ? next(from) : next;
      latest.current = value;
      held.current = value;
      setEdited(value);
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = setTimeout(flush, STEP_DRAFT_DEBOUNCE_MS);
    },
    [base, flush]
  );

  useEffect(() => flush, [flush]);

  // 06.1-49 (A-ST-3): a step now stays mounted under the answer (pushed). When the stored check changes underneath it (the answer
  // changed the pay mode or date) and this step holds no unsaved edit, drop the local copy so Back shows the stored check and the
  // next edit builds on it, not on the copy from before the answer.
  useEffect(() => {
    if (held.current !== null) return;
    latest.current = null;
    setEdited(null);
  }, [base]);

  const markVisited = useCallback(
    (step: StepNumber): void => {
      const from = latest.current ?? base;
      if (from === null) return;
      const seen = from.layerAnswers[KEY_VISITED];
      if (Array.isArray(seen) && seen.includes(step)) return;
      update((c) => ({ ...c, layerAnswers: { ...c.layerAnswers, [KEY_VISITED]: [...(Array.isArray(c.layerAnswers[KEY_VISITED]) ? (c.layerAnswers[KEY_VISITED] as number[]) : []), step] } }));
    },
    [base, update]
  );

  const finish = useCallback(
    (from: StepNumber, prepare?: (c: CheckV2) => CheckV2): void => {
      update((c) => {
        const visited = Array.isArray(c.layerAnswers[KEY_VISITED]) ? (c.layerAnswers[KEY_VISITED] as number[]) : [];
        const seen = new Set<number>([...visited, from]);
        const skipped = ([1, 2, 3] as const).filter((n) => !seen.has(n));
        const prepared = prepare === undefined ? c : prepare(c);
        return { ...prepared, layerAnswers: { ...prepared.layerAnswers, [KEY_SKIPPED]: skipped } };
      });
      flush();
    },
    [update, flush]
  );

  return { status: check !== null ? 'ready' : checks.isLoading ? 'loading' : 'not_found', check, name: row?.name ?? '', update, flush, markVisited, finish };
}
