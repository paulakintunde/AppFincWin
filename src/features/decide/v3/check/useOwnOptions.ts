// 05.3-83 (UAT step 75 item 2): the user's own item types and purposes, read from decide_settings.custom_options and added
// from Check a purchase. One add = one undo step through useSaveSetupStep. Names are never sent to analytics.
// 05.3-84: rename, re-base ("counts like") and remove, each one undoable save. Remove only marks the entry deleted.
import { useMemo } from 'react';
import * as Crypto from 'expo-crypto';
import type { V3PresetItemType } from '@/engine/decide/v3';
import { useRecordContext } from '@/features/record/useRecordContext';
import { useDecideSettings } from '@/data/queries/decide';
import { useSaveSetupStep } from '@/data/mutations/decideSetup';
import { showToast } from '@/state/undoToast';
import {
  addOwnItemType,
  addOwnPurpose,
  ownLabels,
  parseOwnOptions,
  removeOwnOption,
  renameOwnOption,
  setOwnItemTypeBase,
  type StoredOwnOptions,
} from '../model/ownOptions';
import type { CustomLabel } from '../model/checkOptions';

export type OwnRefusal = 'too_many' | 'name_taken' | 'name_length' | 'not_found';
export type AddOwnResult = { readonly ok: true; readonly id: string } | { readonly ok: false; readonly reason: OwnRefusal };
export type EditOwnResult = { readonly ok: true } | { readonly ok: false; readonly reason: OwnRefusal };

export interface OwnItemRow {
  readonly id: string;
  readonly name: string;
  readonly base: V3PresetItemType;
}

type Kind = 'itemType' | 'purpose';

export interface UseOwnOptions {
  itemTypes: readonly CustomLabel[];
  purposes: readonly CustomLabel[];
  /** live own kinds with the preset each counts like (05.3-84) */
  itemRows: readonly OwnItemRow[];
  retired: ReadonlyMap<string, string>;
  liveCount: { itemTypes: number; purposes: number };
  add(kind: Kind, input: { name: string; base?: V3PresetItemType }): AddOwnResult;
  /** Renames; for a kind of purchase an optional base also changes what it counts like, in the same save. */
  rename(kind: Kind, id: string, name: string, base?: V3PresetItemType): EditOwnResult;
  remove(kind: Kind, id: string): EditOwnResult;
  setBase(kind: 'itemType', id: string, base: V3PresetItemType): EditOwnResult;
}

export function useOwnOptions(): UseOwnOptions {
  const rc = useRecordContext();
  const userId = rc.userId ?? '';
  const settings = useDecideSettings(rc.userId ?? undefined);
  const saver = useSaveSetupStep(userId);
  const row = settings.data ?? null;
  const raw = row === null ? null : (row as { custom_options?: unknown }).custom_options;
  const labels = useMemo(() => ownLabels(raw), [raw]);
  const itemRows = useMemo(
    () =>
      parseOwnOptions(raw)
        .itemTypes.filter((t) => t.deletedAt === null)
        .map((t) => ({ id: t.id, name: t.name, base: t.base })),
    [raw],
  );
  const retired = useMemo(() => {
    const live = new Set([...labels.itemTypes, ...labels.purposes].map((l) => l.id));
    return new Map([...labels.allNames].filter(([id]) => !live.has(id)));
  }, [labels]);

  const commit = (next: StoredOwnOptions, key: string, name: string, kind: 'ordinary' | 'destructive'): EditOwnResult => {
    const saved = saver.save({ labelKey: 'setupStepSaved', patch: { custom_options: next } });
    showToast({ kind, text: { key, params: { name } }, stepId: saved?.stepId ?? null });
    return { ok: true };
  };
  const unavailable = row === null || !rc.userId;

  return {
    itemTypes: labels.itemTypes,
    purposes: labels.purposes,
    itemRows,
    retired,
    liveCount: { itemTypes: labels.itemTypes.length, purposes: labels.purposes.length },
    add(kind, input) {
      if (row === null || !rc.userId) return { ok: false, reason: 'not_found' };
      const stored = parseOwnOptions(raw);
      const id = Crypto.randomUUID();
      const r =
        kind === 'itemType'
          ? addOwnItemType(stored, { id, name: input.name, base: input.base ?? 'general' })
          : addOwnPurpose(stored, { id, name: input.name });
      if (!r.ok) return r;
      const saved = saver.save({ labelKey: 'setupStepSaved', patch: { custom_options: r.next } });
      showToast({ kind: 'ordinary', text: { key: 'decide.v3.ui.ownOptions.savedToast', params: { name: input.name.trim() } }, stepId: saved?.stepId ?? null });
      return { ok: true, id };
    },
    rename(kind, id, name, base) {
      if (unavailable) return { ok: false, reason: 'not_found' };
      const r = renameOwnOption(parseOwnOptions(raw), kind, id, name);
      if (!r.ok) return r;
      const b = kind === 'itemType' && base !== undefined ? setOwnItemTypeBase(r.next, id, base) : r;
      if (!b.ok) return b;
      return commit(b.next, 'decide.v3.ui.ownOptions.renamedToast', name.trim(), 'ordinary');
    },
    remove(kind, id) {
      if (unavailable) return { ok: false, reason: 'not_found' };
      const stored = parseOwnOptions(raw);
      const entry = (kind === 'itemType' ? stored.itemTypes : stored.purposes).find((e) => e.id === id && e.deletedAt === null);
      if (entry === undefined) return { ok: false, reason: 'not_found' };
      return commit(removeOwnOption(stored, kind, id, rc.today), 'decide.v3.ui.ownOptions.removedToast', entry.name, 'destructive');
    },
    setBase(_kind, id, base) {
      if (unavailable) return { ok: false, reason: 'not_found' };
      const r = setOwnItemTypeBase(parseOwnOptions(raw), id, base);
      if (!r.ok) return r;
      return commit(r.next, 'decide.v3.ui.ownOptions.renamedToast', r.next.itemTypes.find((t) => t.id === id)?.name ?? '', 'ordinary');
    },
  };
}
