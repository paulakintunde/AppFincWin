// 06.1-14 (D-15): answer fixtures are engine runs, never prototype figures. Each LEDGER scenario (design/LEDGER.md, "Scenarios") is
// stood in for by the engine's approved right-answers case that lands on the same engine code and variant, run through the real
// prepare + judgeCheck. (The LEDGER engine-run scripts live outside the repo, so the ledger itself cannot be rebuilt here; the codes,
// variants and fact order are what the frame has to carry, and those come from the same engine.)
import { judgeCheck, prepare, type CheckV2, type Evaluation, type V3Inputs } from '@/engine/decide/v3';
import { checkOnce, inputsOf } from '@/engine/decide/v3/__tests__/helpers/fixtures';
import { toEngineInputs } from '@/engine/decide/v3/__tests__/rightAnswers/fixture';
import { loadCases } from '@/engine/decide/v3/__tests__/rightAnswers/loader';
import type { AnswerCheckView } from '../AnswerFrame';

/** LEDGER scenario -> the right-answers case with the same engine code and variant. */
export const LEDGER_CASES = {
  N02: { caseId: 'SN-08', code: 'fits_month', variant: 'small_net' }, // headphones, safety net small
  N04: { caseId: 'RC-02', code: 'fits_unspent', variant: 'tight' }, // laptop, tight; carries two caveats and large_for_month
  N05: { caseId: 'GL-04', code: 'not_yet', variant: 'not_covered' }, // net locked, ready later
  N09: { caseId: 'RC-01', code: 'monthly_short', variant: null }, // car plan, short each month
  N12: { caseId: 'OD-11', code: 'fits_uses_overdraft', variant: 'not_cleared' }, // overdraft not cleared
  N26: { caseId: 'QE-11', code: 'monthly_short', variant: 'month_already_short' }, // month already short
} as const;

export type LedgerScenario = keyof typeof LEDGER_CASES;

export interface Run {
  readonly inputs: V3Inputs;
  readonly check: CheckV2;
  readonly evaluation: Evaluation;
}

function run(inputs: V3Inputs, check: CheckV2): Run {
  return { inputs, check, evaluation: judgeCheck(prepare(inputs), check) };
}

const cache = new Map<string, Run>();

export function ledgerRun(scenario: LedgerScenario): Run {
  const hit = cache.get(scenario);
  if (hit !== undefined) return hit;
  const spec = LEDGER_CASES[scenario];
  const found = loadCases().find((c) => c.id === spec.caseId);
  if (found === undefined) throw new RangeError(`no right-answers case ${spec.caseId}`);
  const { inputs, check } = toEngineInputs(found.fixture);
  const made = run(inputs, check);
  cache.set(scenario, made);
  return made;
}

/** N24: first run, no records. The engine says the check is not ready. */
export function notReadyRun(): Run {
  return run(inputsOf({ asOf: '2026-11-05' }), checkOnce(20000));
}

/** The frame's view of a run's check, written the way a screen would write it. */
export function viewOf(r: Run, name = 'Item'): AnswerCheckView {
  return {
    name,
    priceText: '$200.00',
    pay: r.check.pay.mode === 'plan' ? 'plan' : 'cash',
    when: 'today',
    purpose: r.check.purpose,
    options: ['later', 'cheaper', 'installments'],
    country: r.inputs.region,
  };
}
