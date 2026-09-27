# Deferred Items — Phase 02: Record

Out-of-scope discoveries logged during plan execution, per the executor's
Scope Boundary rule (only auto-fix issues directly caused by the current
task's changes).

## From 02-01 (recurring schedule maths)

- **`src/features/you/__tests__/YouScreen.test.tsx` — `YouScreen identity ›
  renders the user's full name and email sub-label`**: fails intermittently
  with `Exceeded timeout of 5000 ms for a test` when run as part of the full
  suite (1328/1329 passing otherwise). This is a Phase 1 (money-core) test,
  unrelated to recurring schedule maths, and not modified by 02-01. Likely a
  flaky render timeout under load (the sandbox's full-suite run took over
  five minutes across 77 suites). Not fixed here — out of scope for this
  plan. Re-run in isolation or raise the test's timeout if it recurs.
