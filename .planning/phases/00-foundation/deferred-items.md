# Deferred Items

Out-of-scope discoveries logged during plan execution, per the executor's scope-boundary rule
(fix only what the current task's changes touch; log everything else here instead).

## 00-16: flaky assertion in src/data/__tests__/persister.test.ts

- **Found during:** 00-16 Task 1 full-suite verification run (`npx jest`), unrelated to this
  plan's files.
- **Test:** `encrypted query cache persister > persists ciphertext only at the query-cache key,
  never the plaintext payload` (`src/data/__tests__/persister.test.ts:63`)
- **Symptom:** `expect(raw).not.toContain('1234')` occasionally fails. The persister test uses
  real AES-GCM (`globalThis.crypto = require('crypto').webcrypto`, not a seeded/mocked RNG), so
  the hex-encoded ciphertext is genuinely random per run. A 4-digit substring has a non-trivial
  chance of appearing somewhere in a ~500+ character random hex string across repeated runs.
  Confirmed non-deterministic: failed once in a full-suite run, passed immediately on an
  isolated re-run of the same test.
- **Not fixed here:** this file is outside 00-16's `files_modified` and was not touched by this
  plan; the flakiness is pre-existing and belongs to whichever plan owns
  `src/data/cache/persister.ts`.
- **Suggested fix (for whoever owns that file):** assert structurally instead of via substring
  exclusion — e.g. decrypt with the wrong key and confirm failure, or assert the ciphertext
  round-trips to the exact plaintext via decryption rather than asserting an absent substring
  in random bytes.
