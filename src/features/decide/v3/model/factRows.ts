/** 05.3-19: the facts card rows. Pure. Figure rows for the amounts a person reads at a glance; every other fact is a sentence. */
import type { Fact, Result } from '@/engine/decide/v3';
import type { MinorUnits } from '@/engine/money';
import { factCopy } from './copyPick';

export interface FactRow {
  readonly kind: 'figure' | 'sentence' | 'coveredBy';
  readonly labelKey: string;
  readonly labelParams: Readonly<Record<string, string | number>>;
  readonly figure?: MinorUnits;
  readonly negative?: boolean;
  readonly subKey?: string;
  readonly subParams?: Readonly<Record<string, string | number>>;
  readonly tone?: 'warn';
}

const R = 'decide.v3.ui.factRow.';

function num(v: string | number | null | undefined): MinorUnits | undefined {
  return typeof v === 'number' ? (v as MinorUnits) : undefined;
}

function str(v: string | number | null | undefined): string {
  return v === null || v === undefined ? '' : String(v);
}

function figureRow(f: Fact): FactRow | null {
  const v = f.values;
  switch (f.code) {
    case 'month_left_after': {
      const left = num(v.left) ?? (0 as MinorUnits);
      return { kind: 'figure', labelKey: `${R}monthLeftAfter`, labelParams: { month: str(v.month) }, figure: left, negative: left < 0 };
    }
    case 'unspent_before_after':
      return { kind: 'figure', labelKey: `${R}unspent`, labelParams: {}, figure: num(v.after), subKey: `${R}unspentFrom`, subParams: { before: num(v.before) ?? 0 } };
    case 'emergency_untouched':
      return { kind: 'figure', labelKey: `${R}emergencyUntouched`, labelParams: {}, figure: num(v.amount) };
    case 'emergency_used': {
      const row: FactRow = { kind: 'figure', labelKey: `${R}emergencyUsed`, labelParams: {}, figure: num(v.used) };
      return typeof v.months === 'number' ? { ...row, subKey: `${R}rebuild`, subParams: { months: v.months } } : row;
    }
    case 'envelope_used':
      return { kind: 'figure', labelKey: `${R}envelopeUsed`, labelParams: { envelopeId: str(v.envelopeId) }, figure: num(v.used) };
    case 'unspent_held_back':
      return { kind: 'figure', labelKey: `${R}unspentHeldBack`, labelParams: {}, figure: num(v.amount) };
    case 'low_month':
      return {
        kind: 'figure',
        labelKey: `${R}lowMonth`,
        labelParams: { month: str(v.month) },
        figure: num(v.left),
        negative: (num(v.left) ?? 0) < 0,
        subKey: `${R}lowMonthMonthly`,
        subParams: { monthly: num(v.monthly) ?? 0 },
      };
    default:
      return null;
  }
}

export function factRows(result: Result): readonly FactRow[] {
  const rows: FactRow[] = [];
  for (const f of result.facts) {
    const fig = figureRow(f);
    if (fig !== null) {
      rows.push(fig);
      continue;
    }
    const c = factCopy(f);
    rows.push({ kind: 'sentence', labelKey: c.key, labelParams: c.params, ...(f.code === 'quoted_differs' ? { tone: 'warn' as const } : {}) });
  }
  const by = result.readyBy;
  if (result.code === 'not_yet' && by !== null) {
    rows.push({
      kind: 'coveredBy',
      labelKey: 'decide.v3.ui.answer.coveredBy',
      labelParams: by.kind === 'month' ? { month: by.month } : { date: by.date },
    });
  }
  return rows;
}
