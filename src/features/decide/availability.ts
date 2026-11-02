// Decide v3 build switch. Pure: no React or I/O import.

/**
 * Owner decision (00-UPGRADE-PLAN.md §2 option 3, §9 decision 1): the Decide tab stays and
 * shows a short coming-soon screen; nothing from today's Decide is shown until v3 switches on.
 * Build-rollout switch, not access control.
 */
export const DECIDE_OPEN: boolean = false;

/**
 * D-15 (05.1): the Decide engine switch. Off until the owner signs off the shadow run (D-14).
 * 05.2 D-02: the per-account flag (profiles.decide_v3, server-written) is passed in by
 * useDecideAccess(); this constant stays false for everyone else. Not access control.
 */
export const DECIDE_V3: boolean = false;

/**
 * 05.4 BO-06: the 05.2 setup page, engine readout and Decide settings are hidden from every account until 08.1.
 * profiles.decide_v3 only drives shadow runs (BO-08) until then.
 */
export const DECIDE_SETUP_VISIBLE: boolean = false;

/** The one place the engine choice is read (UP §8: two engines must never mix). */
export function decideEngine(flags?: { readonly decideV3?: boolean }): 'v2' | 'v3' {
  return DECIDE_V3 || flags?.decideV3 === true ? 'v3' : 'v2';
}
