/**
 * 05.4 BO-08 (D-13, D-146): the engine revision a tester's phone reports its shadow run under. A phone runs the 6 samples once
 * per revision. Bump it whenever anything a shadow row carries would change (the answer, a reason or fact line, a rounded
 * figure) or a saved / approved answer moves: shadow/__tests__/revision.test.ts hashes all of that and fails with
 * "bump DECIDE_ENGINE_REVISION" until it is bumped and the lock rewritten (REVISION_WRITE=1). Matches the table CHECK
 * ^[a-z0-9._-]{1,40}$.
 */
export const DECIDE_ENGINE_REVISION = '06.2'; // 06.2: code review fixes: an unlocked goal counted once (D-22, P2-CR-01/02, P2-WR-01..03), a goal's stated monthly amount set aside (P4-CR-03). 06.1: locked and unlocked goals (D-05, D-06, D-22), GL-01..05 approved
