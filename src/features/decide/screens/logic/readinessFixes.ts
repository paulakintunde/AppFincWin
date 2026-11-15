// 06.1-43 (G-1, audit C-1, C-2, C-4): every named readiness item gets one fix and the answers the engine accepts for its kind.
// Pure: items in, rows out. The waivers are exactly the ones the engine's readiness module settles the item with (05.3-54), so a
// choice the screen offers always clears what it names. D-54: an envelope is never waived; its only fix is saying which account
// holds it. Imports from the v3 engine barrel only.
import type { LocalDate, ReadinessItem, ReadinessWaiver, YearMonth } from '@/engine/decide/v3';

/** Where the item is fixed: in the records for that month, or by linking the envelope to its account (D-54). */
export type ReadinessFix =
  | { readonly kind: 'records'; readonly month: YearMonth; readonly lineId: string | null }
  | { readonly kind: 'linkEnvelope'; readonly envelopeId: string | null };

export type WaiverChoiceKey =
  | 'markSkipped'
  | 'paidByOther'
  | 'didntHappen'
  | 'alwaysOther'
  | 'noPay'
  | 'incomeElsewhere'
  | 'nothingToAdd'
  | 'startFrom';

/** One answer the screen can offer. markSkipped carries the pending line to skip and no waiver; every other choice carries its waiver. */
export interface WaiverChoice {
  readonly key: WaiverChoiceKey;
  readonly waiver: ReadinessWaiver | null;
  readonly lineId: string | null;
}

export interface ReadinessFixRow {
  readonly id: string;
  readonly item: ReadinessItem;
  readonly fix: ReadinessFix;
  readonly choices: readonly WaiverChoice[];
}

const choice = (key: WaiverChoiceKey, waiver: ReadinessWaiver): WaiverChoice => ({ key, waiver, lineId: null });

/** The month after `ym` (YYYY-MM). */
function nextMonth(ym: YearMonth): YearMonth {
  const y = Number(ym.slice(0, 4));
  const m = Number(ym.slice(5, 7));
  return m === 12 ? `${y + 1}-01` : `${ym.slice(0, 4)}-${String(m + 1).padStart(2, '0')}`;
}

function choicesOf(item: ReadinessItem, asOf: LocalDate): readonly WaiverChoice[] {
  const skip: WaiverChoice[] = item.lineId === null ? [] : [{ key: 'markSkipped', waiver: null, lineId: item.lineId }];
  // A bill or pay always names its series and due date; without them no occurrence answer can name it.
  const seriesId = item.seriesId;
  const date = item.date;
  const occ = seriesId !== null && date !== null ? { seriesId, date } : null;
  switch (item.kind) {
    case 'bill': {
      if (occ === null) return skip;
      const first = item.lineId === null ? [choice('didntHappen', { kind: 'didnt_happen', ...occ })] : skip;
      return [...first, choice('paidByOther', { kind: 'paid_by_other', ...occ }), choice('alwaysOther', { kind: 'always_other', seriesId: occ.seriesId })];
    }
    case 'pay': {
      const first = item.lineId !== null ? skip : occ === null ? [] : [choice('noPay', { kind: 'no_pay', ...occ })];
      return [...first, choice('incomeElsewhere', { kind: 'income_elsewhere' })];
    }
    case 'spending':
      return [choice('nothingToAdd', { kind: 'nothing_to_add', month: item.month, at: asOf })];
    case 'late_start':
      return [choice('startFrom', { kind: 'start_from', month: nextMonth(item.month) })];
    case 'envelopes':
      return []; // D-54: never waived
  }
}

/** One row per item, in the engine's order, with its fix and the answers that clear it. */
export function readinessFixRows(items: readonly ReadinessItem[], asOf: LocalDate): readonly ReadinessFixRow[] {
  return items.map((item) => ({
    id: `${item.kind}|${item.month}|${item.seriesId ?? item.envelopeId ?? ''}|${item.date ?? ''}`,
    item,
    fix: item.kind === 'envelopes' ? { kind: 'linkEnvelope', envelopeId: item.envelopeId } : { kind: 'records', month: item.month, lineId: item.lineId },
    choices: choicesOf(item, asOf),
  }));
}

/**
 * D-57 (C-1): quick estimates answer only while the records hold no month before the current one; past that the engine judges
 * the records and the estimates do not count. The screen offers estimates only when this is true.
 */
export function estimatesCanAnswer({ months, asOf }: { readonly months: readonly { readonly month: YearMonth }[]; readonly asOf: LocalDate }): boolean {
  const current = asOf.slice(0, 7);
  return !months.some((m) => m.month < current);
}
