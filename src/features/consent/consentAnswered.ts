import type { UseConsentResult } from './useConsent';

/**
 * WR-D13: the consent prompt has a recorded answer (granted or declined). A missing or failed profile fetch has none, so
 * anything gated on "after consent" (the Decide reminder routing) stays off until an answer is on record.
 */
export function consentAnswered(state: Pick<UseConsentResult, 'loading' | 'consent'>): boolean {
  return !state.loading && state.consent !== null;
}
