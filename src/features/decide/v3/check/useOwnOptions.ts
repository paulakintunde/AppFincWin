// 05.3-83 (UAT step 75 item 2): the user's own item types and purposes, read from decide_settings.custom_options and added
// from Check a purchase. One add = one undo step through useSaveSetupStep. Names are never sent to analytics.
import { useMemo } from 'react';
import * as Crypto from 'expo-crypto';
import type { V3PresetItemType } from '@/engine/decide/v3';
import { useRecordContext } from '@/features/record/useRecordContext';
import { useDecideSettings } from '@/data/queries/decide';
import { useSaveSetupStep } from '@/data/mutations/decideSetup';
import { showToast } from '@/state/undoToast';
import { addOwnItemType, addOwnPurpose, ownLabels, parseOwnOptions } from '../model/ownOptions';
import type { CustomLabel } from '../model/checkOptions';

export type OwnRefusal = 'too_many' | 'name_taken' | 'name_length' | 'not_found';
export type AddOwnResult = { readonly ok: true; readonly id: string } | { readonly ok: false; readonly reason: OwnRefusal };

export interface UseOwnOptions {
  itemTypes: readonly CustomLabel[];
  purposes: readonly CustomLabel[];
  retired: ReadonlyMap<string, string>;
  liveCount: { itemTypes: number; purposes: number };
  add(kind: 'itemType' | 'purpose', input: { name: string; base?: V3PresetItemType }): AddOwnResult;
}

export function useOwnOptions(): UseOwnOptions {
  const rc = useRecordContext();
  const userId = rc.userId ?? '';
  const settings = useDecideSettings(rc.userId ?? undefined);
  const saver = useSaveSetupStep(userId);
  const row = settings.data ?? null;
  const raw = row === null ? null : (row as { custom_options?: unknown }).custom_options;
  const labels = useMemo(() => ownLabels(raw), [raw]);
  const retired = useMemo(() => {
    const live = new Set([...labels.itemTypes, ...labels.purposes].map((l) => l.id));
    return new Map([...labels.allNames].filter(([id]) => !live.has(id)));
  }, [labels]);

  return {
    itemTypes: labels.itemTypes,
    purposes: labels.purposes,
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
  };
}
