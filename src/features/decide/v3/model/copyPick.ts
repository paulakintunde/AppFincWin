/**
 * 05.3-19: which copy variant a notice or fact reads. Pure. Params keep raw values (minor units as numbers, YearMonth
 * strings, ids); the UI formats money and months and resolves ids with COPY_RESOLVERS.
 * D-11: a rate of '9999' (or 'above_max') never reaches the screen. D-46: a count of 1 reads the _one key.
 * D-48: one lean month reads _one, a lean month with nothing left reads _over, with the absolute amount.
 */
import { DISCRIMINATOR_KEYS, FACT_KEYS, NOTICE_KEYS } from '@/engine/decide/v3';
import type { CodeValues, Fact, Notice } from '@/engine/decide/v3';

/** D-11: payoff MAX_APR is 999.99% (pinned >= 999 by decideCopy.test.ts). */
export const OVER_RATE_TEXT = '999';

export type Picked = { readonly key: string; readonly params: Readonly<Record<string, string | number>> };

function plain(values: CodeValues): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(values)) {
    if (v === null || (DISCRIMINATOR_KEYS as readonly string[]).includes(k)) continue;
    out[k] = v;
  }
  return out;
}

function isNegative(v: string | number | null | undefined): boolean {
  return typeof v === 'number' && v < 0;
}

/** Integer negation only; never a float. */
function withAbs(params: Record<string, string | number>, ...names: string[]): Record<string, string | number> {
  const out = { ...params };
  for (const n of names) {
    const x = out[n];
    if (typeof x === 'number' && x < 0) out[n] = -x;
  }
  return out;
}

export function noticeCopy(n: Notice): Picked {
  const base = NOTICE_KEYS[n.code];
  const v = n.values;
  const params = plain(v);
  switch (n.code) {
    case 'envelope_location_assumed':
    case 'account_use_unknown':
    case 'unsaved_changes':
      return { key: v.count === 1 ? `${base}_one` : base, params };
    case 'income_volatile': {
      const one = v.leanFrom !== undefined && v.leanFrom === v.leanTo;
      const over = isNegative(v.leanLeft);
      return { key: `${base}${one ? '_one' : ''}${over ? '_over' : ''}`, params: over ? withAbs(params, 'leanLeft') : params };
    }
    case 'income_from_expected':
      return { key: v.source === 'confirmed' || v.source === 'last_year' || v.source === 'low' ? `${base}_${v.source}` : base, params };
    case 'month_heading_short':
      return { key: v.categoryId !== undefined && v.categoryId !== null ? `${base}_category` : base, params };
    default:
      return { key: base, params };
  }
}

export function factCopy(f: Fact): Picked {
  const base = FACT_KEYS[f.code];
  const v = f.values;
  const params = plain(v);
  switch (f.code) {
    case 'implied_rate':
      if (v.rate === '9999' || v.rate === 'above_max') return { key: `${base}_over`, params: { ...params, rate: OVER_RATE_TEXT } };
      return { key: base, params };
    case 'lean_months_judged': {
      const one = v.from !== undefined && v.from === v.to;
      const over = isNegative(v.leanLeft);
      return { key: `${base}${one ? '_one' : ''}${over ? '_over' : ''}`, params: over ? withAbs(params, 'leanLeft') : params };
    }
    case 'lean_bridge':
      return isNegative(v.leanLeft) ? { key: `${base}_over`, params: withAbs(params, 'leanLeft', 'shortfall') } : { key: base, params };
    case 'line_crossed':
      return { key: v.unit === 'percent' || v.unit === 'money' || v.unit === 'tenths' ? `${base}_${v.unit}` : base, params };
    case 'emergency_used':
      return { key: v.months !== undefined && v.months !== null ? `${base}_rebuild` : base, params };
    default:
      return { key: base, params };
  }
}
