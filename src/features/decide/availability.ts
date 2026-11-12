// Decide v3 build switch. Pure: no React or I/O import.

/**
 * Owner decision (00-UPGRADE-PLAN.md §2 option 3, §9 decision 1): the Decide tab stays and
 * shows a short coming-soon screen; nothing from today's Decide is shown until v3 switches on.
 * Build-rollout switch, not access control.
 */
// Owner 2026-11-06 (quick-261106-bf2): Decide opens for every tester. The app is testers-only, not on any store.
export const DECIDE_OPEN: boolean = true;

/**
 * D-15 (05.1): the Decide engine switch. Off until the owner signs off the shadow run (D-14).
 * 05.2 D-02: the per-account flag (profiles.decide_v3, server-written) is passed in by
 * useDecideAccess(); this constant stays false for everyone else. Not access control.
 */
// Owner 2026-11-06 (quick-261106-bf2): v3 for every account, whatever profiles.decide_v3 says. The old engine is off;
// its code is deleted in 05.5.
export const DECIDE_V3: boolean = true;

/**
 * 05.4 BO-06: the 05.2 setup page, engine readout and Decide settings are hidden from every account until 08.1.
 * profiles.decide_v3 only drives shadow runs (BO-08) until then.
 */
export const DECIDE_SETUP_VISIBLE: boolean = false;

/** The one place the engine choice is read (UP §8: two engines must never mix). */
export function decideEngine(flags?: { readonly decideV3?: boolean }): 'v2' | 'v3' {
  return DECIDE_V3 || flags?.decideV3 === true ? 'v3' : 'v2';
}
