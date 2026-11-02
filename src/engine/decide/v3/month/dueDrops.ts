/**
 * The one rule for bill dues that no longer count against the user (05.3-63; D-27, D-31). Pure: no clock, no I/O.
 *
 * Dropped are: an occurrence the user said someone else paid (paid_by_other, D-27), every occurrence of a series
 * someone else always pays (always_other, D-31), and an occurrence marked skipped. The other waiver kinds are
 * readiness-only and drop nothing (D-52).
 *
 * "A recorded payment still wins" is applied at each call site, because only the site knows its paid lines: settle
 * the dues against the paid lines first, then drop only the unsettled dues for which has() is not null.
 */
import { MATCH_DAYS } from '../constants';
import { addDays } from '../dates';
import type { LocalDate, V3Inputs } from '../types';
import { seriesIndex, seriesOccurrences } from './series';
import { dueKey, matchWindowDays } from './settle';

export type DueDropReason = 'paid_by_other' | 'always_other' | 'skipped';

export interface DueDrops {
  /** Series ids someone else always pays (D-31): every occurrence, every month. */
  readonly alwaysOther: ReadonlySet<string>;
  /** dueKey `${seriesId}|${date}` -> why that one occurrence is dropped. */
  readonly keys: ReadonlyMap<string, 'paid_by_other' | 'skipped'>;
  /** paid_by_other wins over always_other, which wins over skipped. */
  has(seriesId: string, date: LocalDate): DueDropReason | null;
}

export function dueDrops(inputs: Pick<V3Inputs, 'asOf' | 'series' | 'waivers' | 'skipped'>): DueDrops {
  const alwaysOther = new Set<string>();
  const keys = new Map<string, 'paid_by_other' | 'skipped'>();

  // A skip is resolved to its series' occurrence within the match window of the skip date. Windows of neighbouring
  // occurrences never overlap (matchWindowDays), so there is at most one.
  const index = seriesIndex(inputs.series);
  for (const skip of inputs.skipped ?? []) {
    const s = index.get(skip.seriesId);
    if (s === undefined) continue;
    const w = matchWindowDays(s.cadence, MATCH_DAYS);
    const [date] = seriesOccurrences(s, addDays(skip.date, -w), addDays(skip.date, w + 1), inputs.asOf);
    if (date !== undefined) keys.set(dueKey({ seriesId: s.id, date, amount: s.amount }), 'skipped');
  }

  for (const w of inputs.waivers ?? []) {
    if (w.kind === 'always_other') alwaysOther.add(w.seriesId);
    // A waiver dated after asOf is ignored.
    else if (w.kind === 'paid_by_other' && w.date <= inputs.asOf) keys.set(`${w.seriesId}|${w.date}`, 'paid_by_other');
  }

  return {
    alwaysOther,
    keys,
    has(seriesId: string, date: LocalDate): DueDropReason | null {
      const key = keys.get(`${seriesId}|${date}`);
      if (key === 'paid_by_other') return key;
      if (alwaysOther.has(seriesId)) return 'always_other';
      return key ?? null;
    },
  };
}
