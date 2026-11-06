// 05.3-13: neutral home for coolingOffAt, so decideOutcome no longer imports decideGoAhead (D-01 follow-up can delete it).

/** The cooling-off reminder fires 48 hours after the decision. */
export function coolingOffAt(now: Date): string {
  return new Date(now.getTime() + 48 * 60 * 60 * 1000).toISOString();
}
