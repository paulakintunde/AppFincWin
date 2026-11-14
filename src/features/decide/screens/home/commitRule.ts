/**
 * 06.1-22 (D49, D50): the one way a rule change is saved. The crossing check runs on the new rules before the write; when the rule
 * newly pushes an open check over it, the haptic is the warning one and the toast names the check; otherwise it is the light one.
 * The write is one Undo step and the toast carries its Undo.
 * 06.1-80 (H-17): the toast names the step's label (`undoLabel`), since its own text key is not an undo label; without it the
 * toast host showed no Undo.
 */
import { showToast } from '@/state/undoToast';
import { hapticLight, hapticWarning } from '@/ui/haptics';
import type { Crossing } from './homeCardsModel';
import type { RulesPatch } from './useHomeCards';

export type RuleLabel = 'ruleAdded' | 'ruleEdited' | 'ruleRemoved';

export interface CommitRuleArgs {
  patch: RulesPatch;
  label: RuleLabel;
  /** Names the open checks the patch newly crosses; a removed rule never crosses anything. */
  crossings: (patch: RulesPatch) => readonly Crossing[];
  save: (patch: RulesPatch, label: RuleLabel) => string | null;
  /** The toast text key when nothing is crossed. */
  doneKey: string;
}

export function commitRule({ patch, label, crossings, save, doneKey }: CommitRuleArgs): void {
  const crossed = label === 'ruleRemoved' ? [] : crossings(patch);
  const stepId = save(patch, label);
  if (crossed.length > 0) {
    hapticWarning();
    showToast({
      kind: 'ordinary',
      tone: 'warning',
      text: { key: 'decide.screens.sheetsHome.rule.crosses', params: { count: crossed.length, item: crossed[0]?.name ?? '', undoLabel: label } },
      stepId,
    });
    return;
  }
  hapticLight();
  showToast({ kind: 'ordinary', text: { key: doneKey, params: { undoLabel: label } }, stepId });
}
