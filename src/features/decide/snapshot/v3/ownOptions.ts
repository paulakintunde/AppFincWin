// PURE. 05.3-81 (UAT step 75 item 2, 05.1 D-19): the user's own item types and purposes, as stored in
// decide_settings.custom_options. No React, no I/O. Ids come from the caller so this stays deterministic.
// A deleted option stays stored (with deletedAt) so a past check can still show its label; the engine never gets names.
import { PRESET_QUESTIONS, V3_ITEM_TYPES } from '@/engine/decide/v3';
import type { CustomOptions, OwnQuestion, QuestionId, V3PresetItemType } from '@/engine/decide/v3';

/** Same shape as CustomLabel in v3/model/checkOptions (declared here so the snapshot layer keeps its import list). */
export interface CustomLabel {
  readonly id: string;
  readonly label: string;
}

export const OWN_NAME_MAX = 40;
export const OWN_LIVE_MAX = 10;
export const OWN_STORED_MAX = 40;

export interface OwnItemType {
  readonly id: string;
  readonly name: string;
  readonly base: V3PresetItemType;
  readonly questionIds: readonly QuestionId[];
  readonly ownQuestions: readonly OwnQuestion[];
  readonly deletedAt: string | null;
}

export interface OwnPurpose {
  readonly id: string;
  readonly name: string;
  readonly deletedAt: string | null;
}

export interface StoredOwnOptions {
  readonly v: 1;
  readonly itemTypes: readonly OwnItemType[];
  readonly purposes: readonly OwnPurpose[];
}

export type OwnKind = 'itemType' | 'purpose';

export type OwnEditResult =
  | { readonly ok: true; readonly next: StoredOwnOptions }
  | { readonly ok: false; readonly reason: 'too_many' | 'name_taken' | 'name_length' | 'not_found' };

const EMPTY: StoredOwnOptions = { v: 1, itemTypes: [], purposes: [] };

function isRec(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

function list(x: unknown): readonly unknown[] {
  return Array.isArray(x) ? x : [];
}

function cleanName(x: unknown): string | null {
  if (typeof x !== 'string') return null;
  const t = x.trim();
  return t.length >= 1 && t.length <= OWN_NAME_MAX ? t : null;
}

function idOf(x: unknown): string | null {
  return typeof x === 'string' && x.length > 0 ? x : null;
}

function deletedAtOf(x: unknown): string | null {
  return typeof x === 'string' && x.length > 0 ? x : null;
}

function ownQuestionOf(q: unknown): OwnQuestion[] {
  if (!isRec(q)) return [];
  const id = idOf(q.id);
  const cadence = q.cadence;
  if (id === null || typeof q.label !== 'string') return [];
  if (cadence !== 'monthly' && cadence !== 'yearly' && cadence !== 'one_off') return [];
  if (typeof q.cash !== 'boolean') return [];
  return [{ id, label: q.label, cadence, cash: q.cash }];
}

/** The stored column read defensively: junk gives empty lists; a bad entry drops itself. */
export function parseOwnOptions(raw: unknown): StoredOwnOptions {
  if (!isRec(raw)) return EMPTY;
  const itemTypes: OwnItemType[] = list(raw.itemTypes).flatMap((t) => {
    if (!isRec(t)) return [];
    const id = idOf(t.id);
    const name = cleanName(t.name);
    const base = t.base;
    if (id === null || name === null || !(V3_ITEM_TYPES as readonly unknown[]).includes(base)) return [];
    return [
      {
        id,
        name,
        base: base as V3PresetItemType,
        questionIds: list(t.questionIds).filter((q): q is string => typeof q === 'string'),
        ownQuestions: list(t.ownQuestions).flatMap(ownQuestionOf),
        deletedAt: deletedAtOf(t.deletedAt),
      },
    ];
  });
  const purposes: OwnPurpose[] = list(raw.purposes).flatMap((p) => {
    if (!isRec(p)) return [];
    const id = idOf(p.id);
    const name = cleanName(p.name);
    return id === null || name === null ? [] : [{ id, name, deletedAt: deletedAtOf(p.deletedAt) }];
  });
  return { v: 1, itemTypes, purposes };
}

function sameName(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** Drops the oldest deleted entries first until at most OWN_STORED_MAX remain. Live entries are never dropped. */
function prune<T extends { readonly id: string; readonly deletedAt: string | null }>(xs: readonly T[]): readonly T[] {
  if (xs.length <= OWN_STORED_MAX) return xs;
  const deleted = xs
    .filter((x) => x.deletedAt !== null)
    .sort((a, b) => (a.deletedAt as string).localeCompare(b.deletedAt as string));
  const drop = new Set(deleted.slice(0, xs.length - OWN_STORED_MAX).map((x) => x.id));
  return xs.filter((x) => !drop.has(x.id));
}

type Checked = { readonly ok: true; readonly name: string } | { readonly ok: false; readonly reason: 'name_length' | 'name_taken' };

function checkName(entries: readonly { readonly id: string; readonly name: string; readonly deletedAt: string | null }[], name: string, selfId: string | null): Checked {
  const clean = cleanName(name);
  if (clean === null) return { ok: false, reason: 'name_length' };
  if (entries.some((e) => e.deletedAt === null && e.id !== selfId && sameName(e.name, clean))) return { ok: false, reason: 'name_taken' };
  return { ok: true, name: clean };
}

export function addOwnItemType(stored: StoredOwnOptions, input: { id: string; name: string; base: V3PresetItemType }): OwnEditResult {
  if (stored.itemTypes.filter((t) => t.deletedAt === null).length >= OWN_LIVE_MAX) return { ok: false, reason: 'too_many' };
  const checked = checkName(stored.itemTypes, input.name, null);
  if (!checked.ok) return checked;
  const entry: OwnItemType = {
    id: input.id,
    name: checked.name,
    base: input.base,
    questionIds: PRESET_QUESTIONS[input.base],
    ownQuestions: [],
    deletedAt: null,
  };
  return { ok: true, next: { ...stored, itemTypes: prune([...stored.itemTypes, entry]) } };
}

export function addOwnPurpose(stored: StoredOwnOptions, input: { id: string; name: string }): OwnEditResult {
  if (stored.purposes.filter((p) => p.deletedAt === null).length >= OWN_LIVE_MAX) return { ok: false, reason: 'too_many' };
  const checked = checkName(stored.purposes, input.name, null);
  if (!checked.ok) return checked;
  const entry: OwnPurpose = { id: input.id, name: checked.name, deletedAt: null };
  return { ok: true, next: { ...stored, purposes: prune([...stored.purposes, entry]) } };
}

export function renameOwnOption(stored: StoredOwnOptions, kind: OwnKind, id: string, name: string): OwnEditResult {
  const entries: readonly { readonly id: string; readonly name: string; readonly deletedAt: string | null }[] =
    kind === 'itemType' ? stored.itemTypes : stored.purposes;
  if (!entries.some((e) => e.id === id && e.deletedAt === null)) return { ok: false, reason: 'not_found' };
  const checked = checkName(entries, name, id);
  if (!checked.ok) return checked;
  if (kind === 'itemType') {
    return { ok: true, next: { ...stored, itemTypes: stored.itemTypes.map((t) => (t.id === id ? { ...t, name: checked.name } : t)) } };
  }
  return { ok: true, next: { ...stored, purposes: stored.purposes.map((p) => (p.id === id ? { ...p, name: checked.name } : p)) } };
}

/** 05.3-84: changes which preset a live own kind counts like; it takes that preset's cost questions. Own questions are kept. */
export function setOwnItemTypeBase(stored: StoredOwnOptions, id: string, base: V3PresetItemType): OwnEditResult {
  if (!stored.itemTypes.some((t) => t.id === id && t.deletedAt === null)) return { ok: false, reason: 'not_found' };
  return {
    ok: true,
    next: { ...stored, itemTypes: stored.itemTypes.map((t) => (t.id === id ? { ...t, base, questionIds: PRESET_QUESTIONS[base] } : t)) },
  };
}

/** Marks the entry deleted. The entry stays stored so past checks keep their label; an unknown or already deleted id changes nothing. */
export function removeOwnOption(stored: StoredOwnOptions, kind: OwnKind, id: string, todayIso: string): StoredOwnOptions {
  if (kind === 'itemType') {
    return { ...stored, itemTypes: prune(stored.itemTypes.map((t) => (t.id === id && t.deletedAt === null ? { ...t, deletedAt: todayIso } : t))) };
  }
  return { ...stored, purposes: prune(stored.purposes.map((p) => (p.id === id && p.deletedAt === null ? { ...p, deletedAt: todayIso } : p))) };
}

/** What the engine gets: live entries only, without names. A stored value of any shape is accepted. */
export function liveCustomOptions(raw: unknown): CustomOptions {
  const stored = parseOwnOptions(raw);
  return {
    itemTypes: stored.itemTypes
      .filter((t) => t.deletedAt === null)
      .map((t) => ({ id: t.id, base: t.base, questionIds: t.questionIds, ownQuestions: t.ownQuestions })),
    purposes: stored.purposes.filter((p) => p.deletedAt === null).map((p) => ({ id: p.id })),
    cadences: [],
    incomeKinds: [],
  };
}

export interface OwnLabels {
  readonly itemTypes: readonly CustomLabel[];
  readonly purposes: readonly CustomLabel[];
  readonly allNames: ReadonlyMap<string, string>;
}

export function ownLabels(raw: unknown): OwnLabels {
  const stored = parseOwnOptions(raw);
  const allNames = new Map<string, string>();
  for (const t of stored.itemTypes) allNames.set(t.id, t.name);
  for (const p of stored.purposes) allNames.set(p.id, p.name);
  return {
    itemTypes: stored.itemTypes.filter((t) => t.deletedAt === null).map((t) => ({ id: t.id, label: t.name })),
    purposes: stored.purposes.filter((p) => p.deletedAt === null).map((p) => ({ id: p.id, label: p.name })),
    allNames,
  };
}
