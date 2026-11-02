/**
 * 05.4 UX-04 / CMP-F12: the basis and next-step copy. Every basis kind and every answer reason that can lead a records basis
 * has a sentence, its placeholders are exactly BASIS_VALUE_KEYS, and the sentences read as the cases expect.
 */
import en from '../../../../../i18n/locales/en';
import { REASON_AUDIENCE } from '../../confidence/reasons';
import type { ConfidenceReason, NextStepCode } from '../../types';
import { BASIS_KEYS, BASIS_REASON_KEYS, BASIS_VALUE_KEYS, NEXT_STEP_KEYS } from '../verdictTable';

function resolve(path: string): string {
  let node: unknown = en;
  for (const part of path.split('.')) node = (node as Record<string, unknown>)[part];
  if (typeof node !== 'string') throw new Error(`no copy at ${path}`);
  return node;
}
const placeholders = (s: string): string[] => [...s.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1] as string).sort();

describe('basis copy', () => {
  it('each kind has its sentence with exactly its placeholders', () => {
    for (const [kind, key] of Object.entries(BASIS_KEYS)) {
      expect({ kind, keys: placeholders(resolve(key)) }).toEqual({ kind, keys: [...BASIS_VALUE_KEYS[kind as keyof typeof BASIS_KEYS]].sort() });
    }
    for (const key of Object.values(BASIS_REASON_KEYS)) expect(placeholders(resolve(key))).toEqual([...BASIS_VALUE_KEYS.records_with_reason].sort());
  });

  it('every answer reason except few_months can lead a records sentence and has one', () => {
    const answer = (Object.keys(REASON_AUDIENCE) as ConfidenceReason[]).filter((c) => REASON_AUDIENCE[c] === 'answer' && c !== 'few_months');
    expect(Object.keys(BASIS_REASON_KEYS).sort()).toEqual(answer.sort());
  });

  it('the sentences the cases quote (QE-02, Theme H)', () => {
    expect(resolve(BASIS_KEYS.partial)).toBe('Based on {{used}} of the {{lookedFor}} months of records Decide looks for.');
    expect(resolve(BASIS_KEYS.records)).toBe('Based on {{months}} months of your records, up to {{date}}.');
    expect(resolve(BASIS_KEYS.quick_estimates)).toBe('Based on your quick estimates, not your records.');
    expect(resolve('decide.v3.fact.no_full_month')).toBe('No full month of records yet.');
  });

  it('every next step has its sentence, with no placeholders', () => {
    const steps: readonly NextStepCode[] = ['add_records', 'log_spending', 'confirm_unspent', 'save_changes', 'record_pay', 'finish_setup'];
    expect(Object.keys(NEXT_STEP_KEYS).sort()).toEqual([...steps].sort());
    for (const key of Object.values(NEXT_STEP_KEYS)) expect(placeholders(resolve(key))).toEqual([]);
  });
});
