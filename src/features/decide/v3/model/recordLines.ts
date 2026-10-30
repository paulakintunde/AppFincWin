// 05.3-27 (DSV-13, UI-SPEC Record sheets): the "What gets written" lines, as keys plus raw params. Pure. The sheet turns
// money and months into text through useV3Format; nothing here formats. The lines match what buildBoughtWrite writes.
import type { Cadence, Purchase, Result } from '@/engine/decide/v3';

export type RecordEvery = 'everyWeek' | 'everyTwoWeeks' | 'everyMonth';

export interface RecordLine {
  /** A key under decide.v3.ui.record. The plan line carries `count`, so the catalogue picks its _one / _other form. */
  readonly key: 'lineItem' | 'lineUnspent' | 'lineUnspentDone' | 'linePlan' | 'lineDeposit';
  readonly params: Readonly<Record<string, string | number>>;
}

/** Which "every ..." the plan line shows; a cadence the write cannot make a series of never reaches here, so month is the rest. */
export function everyOf(c: Cadence): RecordEvery {
  if (c.unit === 'week') return c.every === 1 ? 'everyWeek' : c.every === 2 ? 'everyTwoWeeks' : 'everyMonth';
  return 'everyMonth';
}

export function recordLines(args: {
  purchase: Purchase;
  result: Pick<Result, 'facts'>;
  item: string;
  month: string;
  done: boolean;
}): readonly RecordLine[] {
  const { purchase, result, item, month, done } = args;
  const lines: RecordLine[] = [];
  const schedule = purchase.schedule;
  if (purchase.financed && schedule !== null && schedule.financed > 0) {
    lines.push({
      key: 'linePlan',
      params: { count: schedule.count, payment: schedule.payment, every: everyOf(schedule.cadence) },
    });
    if (purchase.dayOne > 0) lines.push({ key: 'lineDeposit', params: { amount: purchase.dayOne } });
  } else {
    lines.push({ key: 'lineItem', params: { item, amount: purchase.dayOne, month } });
  }
  const unspent = result.facts.find((f) => f.code === 'unspent_before_after');
  const after = unspent?.values.after;
  if (typeof after === 'number') lines.push({ key: done ? 'lineUnspentDone' : 'lineUnspent', params: { after } });
  return lines;
}
