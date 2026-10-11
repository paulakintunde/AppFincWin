---
quick_id: 261011-eio
status: complete
commits: [293185b, 984300d]
---
# 261011-eio: limit of 0 means no limit in import (D-49)

- RED 293185b: buildPreview CARD creditLimit 0 / overdraftLimit 0 offers; PDF credit-card into a 0-limit credit account offers 100000; AccountSheet "0" saves credit_limit null. Plus a passing coverage test (card payment pairs with the outgoing leg on another account).
- GREEN 984300d: `setLimit` helper (null or <=0 = unset) used by offerLimit and limitOf; `own` in useStatementImport counts only when > 0; accepted-limit `before` now records the real prior value via optional `CommitContext.priorLimits`; AccountSheet stores null for a typed 0.
- Note: the AccountSheet test is in accounts/__tests__/accounts.test.tsx (no AccountSheet.test.tsx exists).
- Gate: tsc clean, eslint 0 errors, depcruise clean, full jest 247 suites / 6628 tests pass, thresholds held.
