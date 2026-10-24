// 05-12 part 2 (D-24 amended): every open check is judged with all the others; drafts and checks typed in a currency no stored rate converts are left out and counted (A16, D-67).
// Pure: no react, no I/O. Waiting, bought and passed checks never stack (OQ-A4).
import type { StackedCheckInput } from '@/engine/decide';
import type { DecideCheckRow } from '@/db/decideChecks';
import { inHomeCurrency } from './checkCurrency';
import { engineCtxOf, parseCheckInputs, toEngineCheck } from './checkInputs';
import { EMPTY_STACK, type SnapshotResult, type StackSelection } from './types';

function byCreatedThenId(a: DecideCheckRow, b: DecideCheckRow): number {
  if (a.created_at !== b.created_at) return a.created_at < b.created_at ? -1 : 1;
  if (a.id === b.id) return 0;
  return a.id < b.id ? -1 : 1;
}

export function selectOtherChecks(args: {
  checks: readonly DecideCheckRow[];
  excludeId: string | null;
  source: SnapshotResult;
  today: string;
}): StackSelection {
  const { checks, excludeId, source, today } = args;
  if (source.kind === 'none') return EMPTY_STACK;

  const open = checks
    .filter((c) => c.status === 'open' && c.deleted_at === null && c.id !== excludeId)
    .sort(byCreatedThenId);

  const otherChecks: StackedCheckInput[] = [];
  let leftOutIncomplete = 0;
  let leftOutCurrency = 0;
  for (const row of open) {
    // D-67: a check typed in another currency stacks at the latest stored rate; only one with no rate is left out.
    const view = inHomeCurrency(parseCheckInputs(row.inputs, today), source, { isSample: row.is_sample });
    if (view.kind === 'missing') {
      leftOutCurrency += 1;
      continue;
    }
    const engine = toEngineCheck(view.inputs, engineCtxOf(source));
    if (!engine.ok) {
      leftOutIncomplete += 1;
      continue;
    }
    otherChecks.push({ check: engine.check, purchaseRule: null }); // personal scope until Phase 8
  }
  return { otherChecks, openCount: open.length, leftOutIncomplete, leftOutCurrency };
}
