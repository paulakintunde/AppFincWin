/**
 * 05.3-121 (UAT gap 38, UI-SPEC §Notices amendment): which tiles the answer's notices make. Pure.
 * The engine adds one `month_looks_under_logged` notice per excluded month, so a user with six lightly logged months
 * saw six tiles. Two or more such months merge into one item at the first one's place, months in month order, each
 * listed once. One such month keeps its own notice. Every other notice passes through in engine order. The engine's
 * output is not changed (workedModel reads the per-month notices as they are).
 */
import type { Notice, YearMonth } from '@/engine/decide/v3';

export type NoticeTileItem =
  | { readonly kind: 'notice'; readonly notice: Notice }
  | { readonly kind: 'underLogged'; readonly months: readonly YearMonth[] };

const UNDER_LOGGED = 'month_looks_under_logged';

export function noticeTileItems(notices: readonly Notice[]): readonly NoticeTileItem[] {
  const months = [
    ...new Set(notices.filter((n) => n.code === UNDER_LOGGED).map((n) => String(n.values['month']))),
  ].sort();
  if (months.length < 2) return notices.map((notice) => ({ kind: 'notice', notice }));
  const out: NoticeTileItem[] = [];
  let merged = false;
  for (const notice of notices) {
    if (notice.code !== UNDER_LOGGED) out.push({ kind: 'notice', notice });
    else if (!merged) {
      out.push({ kind: 'underLogged', months });
      merged = true;
    }
  }
  return out;
}
