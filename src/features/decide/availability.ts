// Decide build switches. Pure: no React or I/O import.

/**
 * Owner decision (00-UPGRADE-PLAN.md §2 option 3, §9 decision 1): the Decide tab stays and
 * shows a short coming-soon screen when this is off. Build-rollout switch, not access control.
 * 05.5 APP-17: this is the one store-build switch. The old engine is deleted, so there is no
 * second switch and no fallback to an older Decide.
 */
// Owner 2026-11-06 (quick-261106-bf2): Decide opens for every tester. The app is testers-only, not on any store.
export const DECIDE_OPEN: boolean = true;
