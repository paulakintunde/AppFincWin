# Phase 5 — Decide refresh tracker

Started 2026-10-22. Updated at each milestone. Status: ✅ done · 🔄 in progress · ⏳ queued · ❓ needs user

## Workstreams

| # | Workstream | Decisions | Status |
|---|---|---|---|
| A | Provisional FX rate while a line's rate loads | D-69 | ✅ pushed 5edefaa8 |
| B | ⓘ explanations (31 terms + Step 2 terms) | D-70, R15 | 🔄 spec done; Step 2 terms being added |
| C | Custom typed values (durations 1–120, horizon 1–600, rates, slider amounts) | D-71 | ⏳ planned (05-61, 67, 69, 70, 76) |
| D | Hide empty Open checks / Changes; "+ Add a change", "Check an investment" | D-72 | ⏳ planned (05-71, 72) |
| E | Clear current check; Delete saved checks and changes, with Undo | D-73 | ⏳ planned (05-56, 62, 72, 73, 75) |
| F | Verdict screen summary-first, folds, "What breaks" open with warnings | D-74 | ⏳ planned (05-63, 64, 65, 66, 74) |
| G | Obvious tap-to-reveal (chevron + preview, Show details, first-run hint, haptic) | D-75 | ⏳ planned (05-59, 60, 74) |
| H | Text fit: no mid-word breaks or overlaps; stacked "Where it lands" | D-76 | ⏳ planned (05-55, 65, 77, 79) |
| I | Draft & save: background flush, Clear/Delete safety, save status | D-77 | ⏳ planned (05-56, 57, 75) |
| J | Trimmed Decide home | D-78 | ⏳ planned (05-71, 76) |
| K | Step 2 accordion in place, clearer headers, outputs in their card | D-79+ | 🔄 spec being written |
| L | Instalment plan optional APR (engine change) | D-79+ | 🔄 spec being written |
| M | Custom item type ("Treat like") | D-79+ | 🔄 spec being written |
| N | Investment checks: optional expected return (projection only) | D-79+ | 🔄 spec being written |
| O | Step 4 cheaper price applied exactly (engine change) | D-79+ | 🔄 spec being written |

| P | Pixel walkthrough fixes rounds 1–3 (text fit, scroll, header, copy, FX gap, failed-saves screen, kind constraint, delete undo) | — | ✅ pushed ffa6032c |
| Q | Always-reachable Add (You screen group + FAB root cause) | D-85 | 🔄 spec |
| R | "Interest saved" explained | D-86 | 🔄 spec |
| S | Running-cost rows tappable before an amount | D-87 | 🔄 spec |
| T | Speed (shared snapshot, autosave churn) + sync (timeout, backoff, coalesce, labels) | D-88 | 🔄 spec |
| U | Instalment frequency + up to 500 payments (engine) | D-89 | 🔄 spec |
| V | True APR from payments (engine) | D-90 | 🔄 spec |
| W | Card cap 100k home currency + card rules (property, cash-like, tuition, tax by region) | D-91, D-92 | 🔄 spec |
| X | Walkthrough leftovers: back arrow on Decide root, "7676 months", expense currency default | D-93 | 🔄 spec |

## Pipeline

| Step | Status |
|---|---|
| 1. Decisions (popups) | ✅ |
| 2. UI-SPEC R1–R14 + checker approval | ✅ 0c51f27b |
| 3. UI-SPEC R15 (Step 2, item, invest) + re-check | ✅ approved 2e0e6a9a (D-79..D-84) |
| 4. Plans 05-54..05-79 written | ✅ e6fab900 |
| 5. Plan check of 05-54..79 | ✅ ran: 6 blockers, 12 warnings → revision queued with step 6 |
| 6. Revise 05-54..79 + add R15 plans 05-80..87; two re-checks | ✅ 20d42001 |
| 7. Execute waves 10–19 (user 2026-10-23: no pauses from wave 12 on) | 🔄 waves 10 ✅, 11 ✅, 12 ✅ (05-63, 64, 67, 68, 70, 71, 72, 73, 83 + Lock fix b36c072f); 13 ✅ (05-65, 69, 76, 84; CI green 4c41e9f); 14 ✅ (05-66, 85, 86; CI green 6dbbd4c); wave 15 running (05-74) |
| 8. Gate + CI after each wave | 🔄 wave 11 green at 885e0918 (CI); follow-up: jest open handle after 05-57 (markMonthly suite does not exit without --forceExit) — fix in 05-79 gate |
| 9. Screenshots on the Pixel 9 (402/320 × 1.0/2.0) | ⏳ |
| 10. 05-26 device checks with the user, incl. copy review | ⏳ |
| 11. Verification, PR #82 ready, merge | ⏳ |

## Open questions

- None open. Also answered 2026-10-22: quoted instalment payment is scored (note shows the rate maths); first-payment toggle Today / In a month (default Today); opening a method card selects it; lump-sum horizon 60 months with 1/5/10/20-year chips + Custom.
- Earlier answers 2026-10-22: Left = month end; both screens; What breaks open with warnings; durations 1–120; no-hyphenation app-wide; exact cheaper price; drop verdict body sentence; pause after each wave; Step 2 accordion; instalment APR toggle; custom item type with "Treat like"; invest return projection only.

## Progress

- 2026-10-23: refresh ~42% (design and planning done; build 3 of 34 plans). Phase 5: 56 of 87 plans built. Wave 10 gate: local 539/539 suites, CI green at 809c2dde.
