export interface SecuredFlag {
  readonly secured: boolean;
}

/** DEC-11: a debt is secured when its `secured` field says so; the name is never consulted. */
export function isSecured(debt: SecuredFlag): boolean {
  return debt.secured;
}

/**
 * Import-time default only (DEC-11); the verdict reads the field.
 * Prototype regex: /mortgage|auto|car|forester|home loan|property/i.
 * `forester` is dropped as a seed-data artefact (BUILD-PROMPT section 4) and
 * word boundaries are added so 'card' is not read as 'car'.
 */
export function suggestSecured(debtName: string): boolean {
  return /\b(mortgage|auto|car|home loan|property)\b/i.test(debtName);
}
