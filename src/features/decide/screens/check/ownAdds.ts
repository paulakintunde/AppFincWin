/**
 * 06.1-19 (carry-forward from 06.1-16): the stepper owns the writes behind "Add your own". The cost sheets only build the engine's
 * shape; here it goes into the check, "Added: {{item}}." shows with Undo, and Undo takes exactly that one thing out again.
 * A one-off line (key `oneOff:{id}`) adds to oneOffFees and is listed under the L0 one-offs answer; own kinds are listed under the
 * L0 own-kinds answer and picked at once. Pure functions plus one hook; the check being edited comes from useStepCheck.
 */
import { useCallback } from 'react';
import { minorUnits } from '@/engine/money';
import type { CheckV2 } from '@/engine/decide/v3';
import { showToast } from '@/state/undoToast';
import type { OwnAdd } from '../sheets/AddYourOwnSheet';
import { KEY_KIND, KEY_NAMES, KEY_ONE_OFFS, KEY_OWN_KINDS, lineNamesOf, ownKindsOf, oneOffsOf, withKind, type StepCheck } from './useStepCheck';

const withAnswer = (c: CheckV2, key: string, value: unknown): CheckV2 => ({ ...c, layerAnswers: { ...c.layerAnswers, [key]: value } });

export function applyOwnAdd(check: CheckV2, add: OwnAdd): CheckV2 {
  if (add.variant === 'running') return { ...withAnswer(check, KEY_NAMES, { ...lineNamesOf(check), [add.line.id]: add.name }), runningCosts: [...(check.runningCosts ?? []), add.line] };
  if (add.variant === 'stop') {
    const named = withAnswer(check, KEY_NAMES, { ...lineNamesOf(check), [add.stop.id]: add.name });
    return { ...named, replaces: { sale: check.replaces?.sale ?? null, stops: [...(check.replaces?.stops ?? []), add.stop] } };
  }
  if (add.variant === 'oneOff') {
    const next = withAnswer(check, KEY_ONE_OFFS, [...oneOffsOf(check), { id: add.id, name: add.name, amount: add.amount }]);
    return { ...next, oneOffFees: minorUnits(Number(check.oneOffFees) + add.amount) };
  }
  const kinds = [...ownKindsOf(check), add.kind];
  return withKind(withAnswer(check, KEY_OWN_KINDS, kinds), `own:${add.kind.id}`);
}

/** Takes one added thing out again, leaving every other edit as it is. */
export function removeOwnAdd(check: CheckV2, add: OwnAdd, previousKind: string | null): CheckV2 {
  if (add.variant === 'running') return { ...check, runningCosts: (check.runningCosts ?? []).filter((l) => l.id !== add.line.id) };
  if (add.variant === 'stop') return { ...check, replaces: { sale: check.replaces?.sale ?? null, stops: (check.replaces?.stops ?? []).filter((s) => s.id !== add.stop.id) } };
  if (add.variant === 'oneOff') {
    const next = withAnswer(check, KEY_ONE_OFFS, oneOffsOf(check).filter((o) => o.id !== add.id));
    return { ...next, oneOffFees: minorUnits(Math.max(0, Number(check.oneOffFees) - add.amount)) };
  }
  const own = withAnswer(check, KEY_OWN_KINDS, ownKindsOf(check).filter((k) => k.id !== add.kind.id));
  const picked = check.layerAnswers[KEY_KIND] === `own:${add.kind.id}`;
  if (!picked) return own;
  if (previousKind === null) {
    const { [KEY_KIND]: _dropped, ...rest } = own.layerAnswers;
    return { ...own, layerAnswers: rest };
  }
  return withKind(own, previousKind as never);
}

export function nameOfAdd(add: OwnAdd): string {
  if (add.variant === 'running') return add.name;
  if (add.variant === 'stop') return add.name;
  if (add.variant === 'oneOff') return add.name;
  return add.kind.name;
}

/** The one place that writes an added thing and shows "Added: {{item}}." with Undo. */
export function useOwnAdd(step: Pick<StepCheck, 'update' | 'check'>): (add: OwnAdd) => void {
  const { update, check } = step;
  return useCallback(
    (add: OwnAdd): void => {
      const previousKind = typeof check?.layerAnswers[KEY_KIND] === 'string' ? (check.layerAnswers[KEY_KIND] as string) : null;
      update((c) => applyOwnAdd(c, add));
      showToast({
        kind: 'destructive',
        text: { key: 'decide.screens.common.toast.added', params: { item: nameOfAdd(add) } },
        onUndo: () => update((c) => removeOwnAdd(c, add, previousKind)),
      });
    },
    [update, check]
  );
}
