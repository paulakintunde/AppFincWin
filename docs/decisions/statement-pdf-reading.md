# Statement PDF reading: where PDFs are read and what is kept

Date: 2026-09-27. Phase 2.1. Covers D-01, D-02, D-04, D-10 to D-15, D-21.

## 1. Decision

PDF statements are read server-side, in the Supabase Edge Function `read-pdf-statement`, using `unpdf@1.8.1` (pdf.js). The function runs in the existing production Supabase project (us-west-2) under the same Supabase DPA.

D-02's preference for on-device reading was weighed. The only on-device candidate returns plain text with no positions and would need a new native build. It is recorded under Deferred Ideas, to be revisited if a mature on-device library with text positions appears.

## 2. Sub-processor cost (D-04)

None. There is no worker service, no new vendor, no new DPA and no new region. `docs/dependency-register.md` needs no new row; its Supabase row gains a note at rollout (plan 02.1-12).

## 3. Flow

1. The app uploads the PDF to the private bucket `statement-uploads` at `<user id>/<random id>.pdf`. Insert is allowed only in the owner's folder; no client can read, list or delete.
2. The app calls `read-pdf-statement` with the path and, if needed, the password.
3. The function reads the file, deletes the object in the same request on every outcome, and returns positioned text.
4. The phone builds the StatementDraft and runs Phase 2's unchanged pipeline.

## 4. Retention (D-10, D-11, D-12)

No copy of any statement is kept, ever, in this phase. A stray upload (crash, closed app, dropped connection) is removed by the hourly `statement-uploads-purge-hourly` job once it is an hour old, so nothing survives two hours.

**For Phase 10 (account deletion): there is no statement store, so account deletion has nothing to purge for statements.** If a later phase adds "keep a copy", that phase must add its own deletion path.

## 5. What the server keeps (D-13)

Nothing extracted from a statement. Only the transactions a user commits are kept, through the normal transaction path with RLS and FX stamping.

## 6. Logs and error reports (D-15)

The server log line carries these fields only: fn, outcome, durationMs, pageCount, byteSize, removed, errorClass (a closed list derived from the error's name). It never carries text, amounts, names, file names, paths, passwords or account numbers. The app sends no Sentry event from the PDF path. Both are enforced by tests (read.test.ts, the readPdf no-leak test, engine noLeak.test.ts).

## 7. Layout fingerprint (D-14)

The `import_pdf_unread` analytics event is the only record of a statement that could not be read. It holds the failed step, a page band, and which column roles were found. It holds no header text, no bank name (no bank templates exist yet, D-18, so nothing is detected), no amounts, names, dates, descriptions or account numbers. It is consent-gated like every event, and its properties are closed literal unions and booleans (ANL-03).

## 8. Passwords (D-21)

A password is sent with the read request over TLS, used once to open that file, and never stored or logged.

## 9. Not in scope

OCR (D-28), AI reader (D-29), keep-a-copy, share-sheet entry, offline queueing, and Free/Pro gating (Phase 9, which should weigh the server cost).
