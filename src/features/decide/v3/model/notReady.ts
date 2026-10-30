/** 05.3-15 (D-06): the not-ready checklist rows in a fixed order; the engine returns them alphabetically. */
import { READINESS_KEYS } from '@/engine/decide/v3';
import type { Readiness, ReadinessCode, YearMonth } from '@/engine/decide/v3';

export const NOT_READY_ORDER = ['past_month_missing', 'activity_not_current', 'envelopes_unconfirmed'] as const;

export interface NotReadyRow {
  readonly code: ReadinessCode;
  readonly titleKey: string;
  readonly month: YearMonth | null;
  readonly reasonKey: string;
  readonly buttonKey: string;
  readonly target: 'activity' | 'envelopes';
}

function previousMonth(m: YearMonth): YearMonth {
  const y = Number(m.slice(0, 4));
  const mo = Number(m.slice(5, 7));
  return mo === 1 ? `${y - 1}-12` : `${y}-${String(mo - 1).padStart(2, '0')}`;
}

export function notReadyRows(readiness: Readiness | undefined, thisMonth: YearMonth): readonly NotReadyRow[] {
  if (readiness === undefined || readiness.ready || readiness.missing.length === 0) return [];
  const rows: NotReadyRow[] = [];
  for (const code of NOT_READY_ORDER) {
    if (!readiness.missing.includes(code)) continue;
    const envelopes = code === 'envelopes_unconfirmed';
    rows.push({
      code,
      titleKey: `decide.v3.ui.notReady.${code}`,
      month: envelopes ? null : code === 'past_month_missing' ? previousMonth(thisMonth) : thisMonth,
      reasonKey: READINESS_KEYS[code],
      buttonKey: envelopes ? 'decide.v3.ui.notReady.openEnvelopes' : 'decide.v3.ui.notReady.openActivity',
      target: envelopes ? 'envelopes' : 'activity',
    });
  }
  return rows;
}
