// Decide v3 build switch. Pure: no React or I/O import.

/**
 * Owner decision (00-UPGRADE-PLAN.md §2 option 3, §9 decision 1): the Decide tab stays and
 * shows a short coming-soon screen; nothing from today's Decide is shown until v3 switches on.
 * Build-rollout switch, not access control.
 */
export const DECIDE_OPEN: boolean = false;
