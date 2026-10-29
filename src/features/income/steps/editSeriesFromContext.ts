/**
 * Injection point for the "edit a series from a date" write, so Decide setup
 * steps (read surfaces, which must not reach the FX fetch door through any
 * import chain: fx-fetch-never-from-reads) can raise a series without
 * importing the mutation module. A host outside features/decide mounts
 * EditSeriesFromProvider; with no provider the step offers no raise.
 */
import { createContext } from 'react';

export interface EditSeriesFromInput {
  readonly id: string;
  readonly householdId: string;
  readonly expectedVersion: number;
  readonly patch: { readonly amount: number };
  readonly effectiveFrom: string;
  readonly ownerId: string;
  readonly name: string;
}

export type EditSeriesFromFn = (input: EditSeriesFromInput) => string;

export const EditSeriesFromContext = createContext<EditSeriesFromFn | null>(null);
