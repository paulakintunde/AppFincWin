---
quick_id: 261011-eio
type: quick
autonomous: true
files_modified:
  - src/features/record/import/importPipeline.ts
  - src/features/record/import/useStatementImport.ts
  - src/features/record/accounts/AccountSheet.tsx
  - src/features/record/import/__tests__/importPipeline.test.ts
  - src/features/record/import/__tests__/importPipeline.pdf.test.ts
  - src/features/record/accounts/__tests__/AccountSheet.test.tsx
---

# Quick 261011-eio: a limit of 0 means "no limit" in import (D-49)

Found in the Phase 02.1 walkthrough step 5: account "Visa" was created with Credit limit typed as 0, so the import's "This statement shows a £1,000.00 limit. Add it to Visa?" offer never appeared. D-49 (src/engine/accounts/standing.ts) defines a limit of exactly 0 as no limit set; the import pipeline treats 0 as a real limit.

## Task 1 (TDD): treat limit <= 0 as unset everywhere in import
- RED first: importPipeline.test.ts — buildPreview with CARD account creditLimit: 0 → limitOffer { field: 'credit_limit', amount: 100000 }; overdraft mirror overdraftLimit: 0 → { field: 'overdraft_limit', amount }. importPipeline.pdf.test.ts — pdfDraft('credit-card') into a credit account with creditLimit 0 → offer 100000.
- Fix importPipeline.ts: one helper (limit null or <= 0 → unset) used by offerLimit (L437-442) and limitOf (L347-350) so inferProfile/convertDraft fall back to the statement's stated limit; acceptedLimit (L851-856) records the account's real prior value as `before`.
- Fix useStatementImport.ts L1426-1447 (`own ?? statedLimit`): own counts only when > 0.
- AccountSheet.tsx L128: store null when the parsed limit is 0 (consistent with edit, L162). Test: creating a credit account with "0" saves credit_limit null.
- Add coverage test (passes today): credit-card.pdf preview with a −50000 'CARD PAYMENT EXAMPLE CARD' candidate on another account on 2026-03-01 yields transfer { kind: 'pair' } for the +50000 row.

verify: targeted jest for import + accounts; typecheck; lint 0 errors; full jest --coverage --ci --forceExit.
done: offer appears for a 0-limit account; tests green.
