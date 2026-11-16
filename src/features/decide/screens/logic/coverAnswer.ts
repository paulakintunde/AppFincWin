/**
 * 05.5-29 (owner decision 1, 2026-11-16): the check's current answer to "Can you cover $X a month for N months, even in your low
 * months?". useCheckEngine lets a saved decide_answers row (kind volatile_cover) win over check.volatileCover, so the answer the
 * person sees is the live saved row first, then the check's own field, else not answered. "Change my answer" reads this and saves
 * the opposite through the same mutation. Pure; no React.
 */
export interface CoverAnswerRow {
  readonly kind: string;
  readonly check_id: string | null;
  readonly bool_value: boolean | null;
  readonly deleted_at?: string | null;
}

export function coverAnswerOf(answers: readonly CoverAnswerRow[] | undefined, checkId: string, check: { readonly volatileCover?: boolean | null }): boolean | null {
  const hit = (answers ?? []).find((a) => a.kind === 'volatile_cover' && a.check_id === checkId && a.bool_value !== null && (a.deleted_at ?? null) === null);
  return hit !== undefined ? hit.bool_value : (check.volatileCover ?? null);
}
