# Post-05.5 test audit: plan

**Prepared:** 2026-11-15 (owner approved preparing it now). **Status:** ready, not started. No test has been run for this audit.
**Starts:** the moment phase 05.5 (One shared money model) has removed the old engine on main (see Entry criteria).
**Companion:** `OWNER-CHECKLIST.md` (the Pixel 6 session, owner's copy). Saved Pixel 6 flows: `p6-flows/` (see Stage B).

## Owner rules for this audit (binding)

- Decide is tested on a phone only after 05.5 removes the old engine. Then **one** combined pass.
- Close phases fast: **one audit, one fix round, one build.** No fix, test, fix loops. Little emulator time. Merge and close come first.
- Owner decisions are asked as plain-English (grade-10) popups with options.
- The owner's Pixel 6 (`21041FDF600BMN`, the owner's own account) is touched only with the owner's go-ahead: never buy anything,
  never change money records. Every adb command is pinned with `-s`.
- The emulator (`Pixel_8_API_36`) may use the spare Google test account (production). Its test data is cleaned up afterwards.
- Never `eas update` / OTA. Any production database change is owner-gated.
- Locked Decide wording (06.1-33 sign-off, hash `8611378a…`) changes only with a new owner sign-off.

## Goal

Before testers get the post-05.5 build, prove on real code and a real phone that Decide gives answers people can trust and that
nothing traps them: every item deferred by 06.1 and 06.2 to "after 05.5" has a result (pass, fixed, waived by the owner, or moved
with a reason), and the one fix round and the one build are done.

## Entry criteria (all must hold; record the values in the audit summary)

1. **05.5 engine removal is on main.** Plans 05.5-16 (Decide on the new builder, changed answers approved), 05.5-19 (old engine
   deleted), 05.5-20 (v2 switch removed, one Decide route) and 05.5-22 (16 core flows green locally) are merged.
   Record: merge PR number(s) and the main commit SHA the audit runs on: `PR #____`, `main @ ________`.
   Waves 1-4 are already on main (PRs #116, #120, #121, #126; main at `c2b5a678` when this plan was written).
   05.5-23 (release), 05.5-24 (Band B) and 05.5-25 (close gate) may run alongside; see popup P-07 for sharing 05.5-23's device session.
2. **Old engine gone:** `npm run depcruise` passes with 05.5-19's lock rule; `check:decide-switch` is gone or reports one Decide.
3. **Production has migration `20261115000100_category_icon_key.sql`** (06.2-17). Without it every category read fails on a
   build that has 06.2. Claude checks read-only (`supabase migration list` with the FincWin token from `C:\dev\fincwin\.env.local`,
   exported per command, never printed). If it is missing, the push is owner-gated (popup P-14, `npm run supabase:db:push`).
4. **G-PD-1 and G-PD-3 are defined** (filled in 2026-11-15 from the 06.1 pre-device check report; see PA-44 and PA-45).
   are. The orchestrator or owner supplies the two one-line descriptions (see "Needs the owner before start").
5. **Owner go-aheads answered** (popups P-07 to P-14 below).
6. The Pixel 6 is charged, USB debugging on, and the owner has about 45 minutes.

## Exit criteria

- Every inventory row has a result: pass, fixed in Stage D, waived by the owner, or moved with a reason (and where to).
- No row marked **Yes** in "Blocks testers" is open.
- Every Stage C popup answer is recorded in the audit summary with its date.
- Test data is cleaned: the emulator account per "Data hygiene", and the owner's two old test items only with the owner's OK.
- One preview APK built from main after the fix round, installed only with the owner's go-ahead, smoke-checked (Stage E).
- `.planning/audits/post-05.5-test-audit/AUDIT-SUMMARY.md` written (results table, timings, decisions, build id).

## Inventory of deferred items (60)

Where: **jest** (automated on main), **emulator** (Maestro or Claude by hand on `Pixel_8_API_36`, spare account), **Pixel 6**
(owner's phone, owner present), **owner decision** (popup), **gate** (must be true before a build reaches a phone).
Blocks testers: **Yes** (must be closed before testers), **If fails** (blocks only if the check fails), **No**, **Unknown**.

Sources: 61 = 06.1-61-SUMMARY; 74 = 06.1-74-SUMMARY; 82-85 = 06.1-82..85-SUMMARY; CO = 06.1 deferred-items "06.1 close-out
(2026-11-14)"; 62D = 06.2 deferred-items; FA = 06.1-FLOW-AUDIT section 6.

### E. Engine items routed to 05.5 (none of these is in a 05.5 plan on main today; see Risks R-1)

| Id | Source | What to check | Where | Blocks testers |
|---|---|---|---|---|
| PA-01 | CO; 85 | **G-PD-2 root fix:** unexplained money is read only from the as-given reading. Expect `DECIDE_ENGINE_REVISION` above `06.7` (src/engine/decide/v3/shadow/revision.ts) and spareMoney.test "thin history" (line 75) inverted to "no ask after a confirm". On the emulator: confirm spare money, then a $12 mug answers with no "What is the $X for?" | jest + emulator | **Yes** |
| PA-02 | CO; 85 | Same-day roll-forward: lines dated on the anchor day are skipped (`l.date <= anchor.at`, src/engine/decide/v3/funds/unspent.ts lines 133 and 150), so an "I bought it" on the day of a confirm does not lower spare money | owner decision (P-04) | No |
| PA-03 | CO; 83 | SN-18 stays a draft case, routed to the engine maths review. Track only: confirm it is still marked routed on the reviewed-answers page | owner decision (status) | No |
| PA-04 | CO | `sayLine` in src/engine/decide/v3/__tests__/reviewed/page.ts ignores `_one` forms (the page can say "1 months") | jest | No |

### T. 06.1-61 Task 3, steps 1-8 (step 9 is the walk rows, group W)

| Id | Source | What to check | Where | Blocks testers |
|---|---|---|---|---|
| PA-05 | 61 step 1 | Install the Stage B preview APK on the Pixel 6 (Claude by adb, only with go-ahead P-08) | Pixel 6 | **Yes** (prerequisite) |
| PA-06 | 61 step 2 | First answer in 12 taps or fewer (UX-11). `decide-first-answer` prints the tap count. Fresh account only if P-12 says so | emulator | If fails |
| PA-07 | 61 step 3; 82 | Boards next to the prototype: D21 (plan payment alone, G-61-11), N18 (no same-day Ready by, G-61-10), FQ8 (no Not ready above the outcome, G-61-3), plus N02, N19, N09, D47. `decide-boards` captures; Claude lists differences for the owner | emulator | No |
| PA-08 | 61 step 4 | Text fit at density 430 and 540 with font scale 2.0: Decide home, stepper step 3 ("yearly" in full), an answer, setup, safety net; no cut-off text | emulator (+05.5-23 matrix on phone) | If fails |
| PA-09 | 61 step 5; 84; 85 | TalkBack order on an answer: verdict, basis, caveat, caveat line, can't-see link, footer, action bar. Empty price field reads "Price" (not "Price, "), also after a clear (G-61-6, G-PD-4); step bar read once (G-61-13) | emulator dump (+05.5-23 TalkBack row) | If fails |
| PA-10 | 61 step 6 | 3-button navigation (CB-3): "I'm not buying it" sits fully above the nav bar and works on the first tap | emulator | If fails |
| PA-11 | 61 step 7 | Back paths (H-3, H-4): a running costs, b set due day then Save, c setup row, d five answers then Back twice. Path b needs a debt with no due day on the test account | emulator (`decide-back-paths`) | If fails |
| PA-12 | 61 step 8; 74 | Pixel 6 speed: checkit_answer < 2,000 ms, stepper_next < 1,000, setup_pay < 1,000, write_settle < 5,000; also record decide_tab_open, stepper_back, past_open, rule_sheet_open, net_settings_open | Pixel 6 (`p6-timing`) | If fails (owner judges) |

### W. Device-walk rows marked "needs Pixel" in 06.1-61 (20 rows: 17 behaviour rows plus DP-5, DP-10, DP-11 timing)

Rows that need a write to money records go to the emulator. Rows that judge feel and speed go to the Pixel 6, read-only.

| Id | Row | What to check (from FA) | Where | Blocks testers |
|---|---|---|---|---|
| PA-13 | DB-5 | The plan sheet does not jump when a field gets focus; taps land on the row tapped | Pixel 6 | No |
| PA-14 | DB-8 | "Which account?" works on the first tap (needs an account-pick ask; set one up) | emulator | No |
| PA-15 | DB-11 | Open-check sheet of a draft: any greyed action says why | emulator | No |
| PA-16 | DB-13 | "Add rule" when disabled says why | emulator | No |
| PA-17 | DB-14 | Pick a date: Back and a backdrop tap close it at once (was about 60 s) | Pixel 6 (emulator if not offered) | No |
| PA-18 | DN-7 | "Back to Decide" after buying lands on Decide home, not the answer | emulator (`decide-bought`, add a landing assert) | No |
| PA-19 | DS-10 | The answer's month count matches Records' "Months complete enough to use" | Pixel 6 (read-only, real data) + emulator | If fails |
| PA-20 | DS-15 | "1 bill to confirm" says which bill | emulator | No |
| PA-21 | DS-17 | Past decision detail shows the up-front amount after a kept purchase (not "Up front —") | emulator | No |
| PA-22 | DS-19 | A one-off "Something changed" has a name field | emulator | No |
| PA-23 | DC-3 | A bought item does not land as an unpaid "Pay" item in Coming up | emulator | If fails |
| PA-24 | DC-4 | Remove from decisions on a bought item says what happens to its record | emulator | If fails |
| PA-25 | DC-5 | A bill Change updates the list and total at once | emulator | No |
| PA-26 | DC-7 | "Add your own rule" adds a new row, not the built-in one | emulator | No |
| PA-27 | DC-8 | Saving pay details ticks Pay | emulator | If fails |
| PA-28 | DC-9 | Delete check asks to confirm or offers Undo; the toast comes quickly | emulator (+Pixel 6 at cleanup) | No |
| PA-29 | DC-10 | A saved "Something changed" can be edited | emulator | No |
| PA-30 | DP-5 | Back from the setup checklist to the answer is quick (was 84.6 s) | Pixel 6 (if the banner shows) | No |
| PA-31 | DP-10 | Records radio write: the toast comes at once (indicative on emulator) | emulator | No |
| PA-32 | DP-11 | Goal-link write lands in seconds, not minutes (indicative on emulator) | emulator | No |

### R. Rechecks of fixes not yet proven on a device

| Id | Source | What to check | Where | Blocks testers |
|---|---|---|---|---|
| PA-33 | CO; 61 G-61-1; 84 | Sheet opened during a screen change shows its panel. Phone: open and close the plan sheet 8 times. Emulator: Fix on "What is <account> for?" 4 times (failed 3 of 4 before 06.1-84) | Pixel 6 + emulator | If seen: **Yes** |
| PA-34 | CO DN-1; 74 | "Check it" lands on the check, never Home; the form is kept (`p6-sheet-dn3`; `decide-check-lands` on the emulator) | Pixel 6 | If seen: **Yes** |
| PA-35 | CO DB-1, DP-1; 74 | Taps after a write: first change under 1 s on the phone (`p6-idle`; emulator was 4.9-6.0 s) | Pixel 6 | If badly over: **Yes** (owner judges) |
| PA-36 | 74 G-74-1; 61 G-61-12; 84 | After Stage A's deletes and buys, Home shows no new red "N changes couldn't save" | emulator | If seen: **Yes** |
| PA-37 | 74 G-74-2 | A Back pressed while a sheet is still sliding up is not lost | Pixel 6 | No |

### F. Known items for the audit-fix round

| Id | Source | What to check | Where | Blocks testers |
|---|---|---|---|---|
| PA-38 | CO G-61-5 | Back lost once just after a sheet closes, and on the open plan sheet after picking 24 months | Pixel 6 (recheck, then fix if seen) | No |
| PA-39 | CO G-61-7 | Changing system font size while in Decide restarts at Home (fontScale not in Android configChanges; a native change, so it rides in the Stage E build) | owner decision (P-05) | No |
| PA-40 | CO G-61-9 | The verdict area keeps "busy" in TalkBack after the update lands | jest (+emulator dump) | No |
| PA-41 | CO G-61-15 | `decide-check-lands` loses the example chip to scroll; `record-as-bought` undo leaves its harness check as a Draft | emulator | No |
| PA-42 | CO | `record-as-bought` Maestro flow red | emulator | No |
| PA-43 | CO; 85 | `decide-bought -e PRICE=9000` stepper subflow ("Next" not visible) | emulator | No |
| PA-44 | CO | G-PD-1: during the decide-stepper-loan flow a failed write "Decide check · The item was changed elsewhere before this change saved" appeared and Home showed "1 edit couldn’t save — changed elsewhere"; the rerun did not repeat it (same family as G-61-12/G-74-1). Check: rerun the flow 3× and watch the failed-writes list | emulator | Does not block (trust) |
| PA-45 | CO | G-PD-3: after tapping the safety-net lock switch the "Safety net locked." toast was missed in 2 of 3 runs, though the lock always took effect (flow timing or a toast that leaves too fast). Check: decide-safety-net flow 3× on the emulator, and once on the Pixel 6 | emulator + Pixel 6 | Does not block |
| PA-46 | CO | History/Undo label "Unspent money confirmed" (`unspentConfirmed`) contains "unspent"; reword needs a new sign-off | owner decision (P-06) | No |
| PA-47 | 62D #6 | Debt-cleared moment never plays for a debt paid off through "Use once" or recurring payments (only the sale flow marks it) | jest (fix) | No |

### L. 06.2 App life device checks and decisions

| Id | Source | What to check | Where | Blocks testers |
|---|---|---|---|---|
| PA-48 | 62D #1 | Calm motion: rise-ins, the once-per-session line draw, ring fills; with Remove animations on, everything is drawn at once | Pixel 6 | No |
| PA-49 | 62D #2 | Toast hand-off: when one toast replaces another, the old fade does not visibly overlap the new one | Pixel 6 (at cleanup) | No |
| PA-50 | 62D #3 | Activity new-row wash: how it looks and how long it lasts after a save; tap feel with it. Screen-record a 20 s clip for the owner | emulator | No |
| PA-51 | 62D #4 | Haptics feel: a light tap on save or Next, a firmer warning on a short answer. Milestone (goal reached, debt cleared, import) needs a record change: see P-13 | Pixel 6 | No |
| PA-52 | 62D #5 | Spacing after 06.2-24 at 320 dp and font 2.0: Home, Activity, the entry sheet | emulator (+05.5-23 matrix) | If fails |
| PA-53 | 62D #7 | "Linked to a check" badge: stay plum, or get a status (tone, icon, word) | owner decision (P-03) | No |
| PA-54 | 62D #8 | Open-checks tile: state icon in state tint (built) or the item's category icon in a plain tile (board L08) | owner decision (P-01) | No |
| PA-55 | 62D #5; 06.2-24 | Accept the larger gap between groups (18 to 28) after seeing Home on the phone | owner decision (P-02) | No |

### G. Gates

| Id | Source | What to check | Where | Blocks testers |
|---|---|---|---|---|
| PA-56 | 62D #10 | Migration `20261115000100` applied in production before any build reaches a phone | gate (read-only check; push is owner-gated, P-14) | **Yes** |
| PA-57 | 62D #9 | A new preview build carries Lottie (06.2 D-25); the Pixel 6 still has 6af04f45 from 06.1-74 | gate (Stage B build) | **Yes** |
| PA-58 | 05.5-VALIDATION | 05.5's own manual checks are done or in the shared session: changed-answers review (05.5-16), Home "left after the month's plans" line at 320 dp and large font (05.5-23 matrix) | gate | **Yes** |

### H. Data hygiene

| Id | Source | What to check | Where | Blocks testers |
|---|---|---|---|---|
| PA-59 | CO; 61; 85 | Spare test account cleaned (list under Data hygiene) | emulator | No |
| PA-60 | CO | Owner's own-account test items removed with OK: the headphones $180 check and the used car $9,000 draft | Pixel 6 | No |

### Counts

| Where | Count | | Blocks testers | Count |
|---|---|---|---|---|
| jest | 4 | | Yes | 5 (PA-01, 05, 56, 57, 58) |
| emulator | 29 | | If fails / if seen | 15 |
| Pixel 6 | 15 | | No | 38 |
| owner decision | 9 | | Unknown | 2 (PA-44, 45) |
| gate | 3 | | | |
| **Total** | **60** | | **Total** | **60** |

Closed before this audit, not in the table: G-61-2, 3, 4, 6, 8, 10, 11, 12, 13, 14 (06.1-82..85), G-78-2 and G-74-1 code
(06.1-81, device proof is PA-33 and PA-36), G-61-16 (moot: cache is now v11), CLAUDE.md design-fidelity edit (accepted on main).

## Stages

### Stage A: automated re-run on main (Claude, no owner time; about half a day of machine time)

Work in a fresh worktree on the entry commit with real `node_modules` (not a junction), separate from `C:\dev\fincwin`, which
other sessions switch. Never edit that worktree while a flow runs (G-78-1).

1. **Suite (milestone run):** `npm run typecheck`, `npm run lint`, `npm run depcruise`, `npm run test:coverage`,
   `npm run check:right-answers`, `npm run test:crosscheck`, `npm run check:cache-version`, `npm run check:icons`,
   `npm run check:money-mirror`, `npm run check:decide-demo-mirror`, `npm run lint:migrations` (plus `check:decide-switch` if it
   still exists). Known load flakes (setupBanner, leaveToChecklist): rerun alone once; a pass alone counts.
2. **Engine items:** PA-01 (revision and the thin-history test), PA-02 (read unspent.ts lines 133/150: changed or not),
   PA-04 (reviewed page `_one`), PA-03 (SN-18 status). If PA-01 has not landed, mark it open and raise P-09 at once.
3. **Gate checks:** PA-56 read-only migration list; PA-58 read 05.5-16 and 05.5-23 summaries.
4. **Emulator** (Pixel_8_API_36, `-gpu swiftshader_indirect`, dev build, Metro `--clear` from the frozen worktree, dev client at
   `127.0.0.1`, spare account; pin every command to `emulator-5554`; the Pixel 6 is never touched in Stage A):
   - the 16 core flows (`node scripts/maestro-core-flows.mjs --list`), fresh app start before each counted run;
   - **G-PD-2 check (PA-01):** confirm spare money on the answer ("That's right"), then a $12 mug check: expect an answer, not
     "What is the $X for?"; then `decide-bought -e PRICE=9000`; undo both confirms through History afterwards;
   - PA-06, PA-07, PA-08, PA-09, PA-10, PA-11, PA-14..16, PA-18..29, PA-31, PA-32, PA-33 (emulator half), PA-36, PA-41..43,
     PA-50, PA-52 (by flow where one exists, by hand plus `uiautomator dump` and screenshots where not);
   - re-prove the four saved Pixel flows in `p6-flows/` on the emulator first (copy them into `.maestro/` of the frozen worktree,
     uncommitted, because they call `common/…`). Their selectors date from 2026-11-13; 06.1-83..85 and 05.5 changed text since.
5. Emulator timings are recorded but not judged (not the device target).
6. **Output:** results table in the audit summary; a short "differences for the owner" list (boards, wash clip) for Stage C.

### Stage B: one owner Pixel 6 session (45 minutes or less; owner present)

Use `OWNER-CHECKLIST.md` (29 lines, grouped by screen; lines 21-23 only if P-07 = yes; 26-28 only if P-10c = yes). Preparation by Claude before the owner sits down (with go-aheads P-08, P-10):
- Build the Stage B preview APK from the entry commit (or reuse 05.5-23's release candidate from the same commit; P-07). Follow
  the 06.1-61 build recipe: real `node_modules`, full env set from `C:\dev\fincwin\.env.local` per command, the shell's
  other-account `SUPABASE_ACCESS_TOKEN` unset, `eas build --profile preview --platform android --non-interactive --no-wait`.
- Install on the Pixel 6 with `adb -s 21041FDF600BMN install -r <apk>` only after P-08. Preview build only on the phone: no
  dev client, no Metro (G-78-1).
- **Timing capture** (PA-12, PA-34, PA-35): with P-10, Claude runs, owner hands off, about 10 minutes:
  `maestro --device 21041FDF600BMN test p6-timing.yaml`, then `p6-idle.yaml`, then `p6-sheet-dn3.yaml`, then `p6-cleanup.yaml`
  (`CLEANUP deleted=2` expected). They never answer the first-answer gate, never tap "Not ready yet" actions, and write only two
  draft checks, "desk lamp 74" and "used car 74". Copy every `TIMING` line into the summary and compare with:
  checkit_answer < 2,000; stepper_next < 1,000; setup_pay < 1,000; write_settle < 5,000; tap after a write < 1,000 ms.
  **Fallback if P-10 is no or the phone drops off adb (as in 06.1-74):** the owner does checklist lines 5, 7, 14 and 15 again while Claude runs
  `adb -s 21041FDF600BMN shell screenrecord` (needs P-10b); Claude measures tap-to-change from the frames.
- If 05.5-23's device matrix shares this sitting (P-07), Claude runs its density, font and TalkBack cells before or after the
  checklist; the owner only confirms TalkBack rows. Restore density, font scale and TalkBack afterwards
  (`wm density reset`, `font_scale` back to the noted baseline, TalkBack off).
- Every problem the owner names is recorded with its screen and checklist line. No fixing during the session.

### Stage C: owner decisions (one popup round, after Stage B)

Ask as AskUserQuestion popups, at most 4 questions per popup, grade-10 English, recommended option first.

| # | Question (plain English) | Options |
|---|---|---|
| P-01 | Open checks on Decide home: which little picture should each item have? (PA-54) | (a) A symbol for where it stands (ready, not ready, decided) in that state's colour, as built now (recommended: tells you at a glance what to do) / (b) The item's category picture in a plain grey tile, as in design board L08 |
| P-02 | Home now has more space between groups of cards (was 18, now 28). You saw it on your phone. Keep it? (PA-55) | (a) Keep the new spacing (recommended) / (b) Go a bit tighter (22) / (c) Go back to 18 |
| P-03 | The "Linked to a check" label is plum and looks different from the other labels. Should it match them? (PA-53) | (a) Give it a colour, symbol and word like the others (recommended) / (b) Keep it plum as it is |
| P-04 | If you confirm your spare money and then record "I bought it" on the same day, should the spare money go down right away? (PA-02, engine change, needs your review of changed answers) | (a) Yes, lower it right away (recommended) / (b) No, keep it until the next confirm, as now |
| P-05 | If you change your phone's text size while in the middle of a Decide check, the app goes back to Decide home. Fix it? (PA-39) | (a) Yes, keep your place (a small native change that rides in the one build) (recommended) / (b) No, leave it |
| P-06 | The History and Undo line says "Unspent money confirmed". Change the words? (PA-46, locked wording, needs your sign-off) | (a) "Spare money confirmed" (recommended: matches the screen) / (b) Keep as it is |
| P-13 | The strong "well done" buzz (goal reached, debt cleared, import done) cannot be felt without changing real records on your phone. (PA-51) | (a) Trust the automatic test that checks where it is used (recommended) / (b) Feel it on the Pixel 9 signed in to the test account (about 5 minutes, needs that phone) |
| P-15 | (Only if Stage A or B found more.) One question per new problem: fix in this round, or move to Phase 08.2 / 08.1 | fix now / move with reason |
| P-16 | Which problems from your phone session should be fixed now? (list from Stage B) | multi-select |

### Stage D: one fix round (GSD gap plans)

- Scope = every open row with "Yes" or a failed "If fails", plus the owner's "fix now" picks from Stage C, plus the known F rows
  the owner keeps. Anything else moves with a reason (most to 08.1 or 08.2).
- Plan with `/gsd-plan-phase <home> --gaps` (home per popup P-11). Suggested grouping, one wave where files do not overlap:
  - D1 Sheet and Back: G-61-5 (PA-38), G-74-2 (PA-37), any PA-33 recurrence (src/ui/Sheet.tsx).
  - D2 Answer and a11y: G-61-9 (PA-40), G-PD-1, G-PD-3 (PA-44, 45), P-06 label with its sign-off.
  - D3 Engine: PA-01 if still open, PA-02 if P-04 = yes, PA-04. `DECIDE_ENGINE_REVISION` bump, TDD, changed-answers review by
    the owner (05.4 D-14 mechanism), engine coverage stays 100%.
  - D4 Flows: PA-41, PA-42, PA-43 and any Stage A red flow.
  - D5 06.2 and native: PA-47, P-01/P-03 outcomes, P-05 (configChanges; native, so only in the Stage E build).
- Each plan verifies with targeted jest and, only for the flows it touches, one emulator rerun. **No phone retest.** One PR for
  the round, one merge.

### Stage E: one preview APK and owner go-ahead

1. After the fix PR merges, build one preview APK from main (same recipe as Stage B). Record build id, commit and APK link.
   `eas update:list` read-only is fine; **no `eas update`**.
2. Ask the owner (popup): install it on the Pixel 6 now? Install only on yes.
3. Owner smoke check, 5 minutes, no new test loop: open the app; Decide answers the used car or a new practice check; the one
   or two fixed screens look right. A new problem is logged for 08.2 unless it blocks testers, in which case the owner decides.
4. Write `AUDIT-SUMMARY.md`; hand the build to the release step the owner picks.

## Data hygiene

### Emulator, spare Google test account (production; owner approved)
Before Stage A, record the open-checks count and the failed-write list (kept as evidence until PA-36 is judged).

Create only what Stage A needs, with a "pa" tag in every name so cleanup can find it: checks "lamp pa" $25 and "car pa" $9,000;
one kept purchase "mug pa" $12 (PA-21, PA-23, PA-24); pay details (PA-27); one bill Change (PA-25); one "Something changed"
(PA-22, PA-29); one own rule (PA-26); one debt with no due day (PA-11 path b); one goal link (PA-32); one Activity entry (PA-50).

Remove at the end (by Undo through History where possible, otherwise delete; never by SQL):
- everything tagged "pa" above, and the spare-money confirm and unexplained answer from PA-01;
- leftovers from 06.1: drafts headphones 199, concert tickets 150, used car 9,000, laptop 1,500, Used car 2,500 / 9,000,
  headphones 180, desk lamp 25, any bp61, lamp78 or Used car check, "Maestro test laptop", "Car g85" and "Mug g85" (about 69
  open checks in all); and 05.5-22's "Maestro plan n" items;
- settings left changed by 06.1-61 (three account purposes set to Everyday spending, the "None" debts answer): undo through History
  if still offered, otherwise leave and note;
- the failed-write list after PA-36 is judged;
- emulator display back to normal: `wm density reset`, `font_scale 1.0`, gesture navigation, TalkBack off.
Or, if the owner picks P-12b, delete the whole test account in-app (the in-app deletion purges) instead of item by item.

### Owner's Pixel 6 (owner's own account)
- Writes allowed only with P-10: the two drafts "desk lamp 74" and "used car 74", removed by `p6-cleanup.yaml`.
- Checklist lines 14-15 save step drafts on the owner's existing used car $9,000 draft only (a practice draft, deleted at line 27 if P-10c = yes). If the owner says no to that, skip lines 14-17.
- With the owner's OK (P-10c), at the end of the session the owner deletes the headphones $180 check and the used car $9,000
  draft (checklist lines 26-27). Nothing else is created, bought, recorded or changed.
- Restore density, font scale, navigation mode, TalkBack and Remove animations to how they were.

## Risks

| Id | Risk | What we do |
|---|---|---|
| R-1 | **The 06.1 close-out routed G-PD-2's root fix, the same-day roll-forward, SN-18 and the `sayLine` fix "to 05.5", but no 05.5 plan on main carries them.** If they do not land, every thin-history account that confirms spare money is asked "What is the $X for?" once | Stage A step 2 checks first; P-09 asks the owner whether to add a 05.5 plan before 05.5 closes or fix in Stage D (D3) |
| R-2 | G-PD-1 and G-PD-3 have no written description | Entry criterion 4 |
| R-3 | The saved Pixel flows are from 2026-11-13; text moved since (06.1-83..85, 05.5) | Re-prove on the emulator in Stage A before the phone |
| R-4 | The Pixel 6 dropped off adb mid-plan in 06.1-74 | Screen-record fallback (P-10b); owner hand checks still count |
| R-5 | Metro serving a checkout under edit reloads mid-tap (G-78-1) | Preview build on the phone; frozen worktree for the emulator |
| R-6 | The spare account writes go to production | Only "pa"-tagged items; undo through History; cleanup list above |
| R-7 | Two device sessions in a row (05.5-23 matrix, then this) | P-07: share one sitting |
| R-8 | A build reaches a phone before migration 20261115000100 | PA-56 gate before Stage B |
| R-9 | Emulator timing is slow (swiftshader) and Maestro adds overhead | Only phone numbers are judged |
| R-10 | Other sessions switch branches in `C:\dev\fincwin` | Work in a separate worktree |
| R-11 | Owner fatigue past 45 minutes | Checklist is 40 lines; timing runs hands-off; stop at 45 minutes and log the rest as "not reached" |

## Out of scope

- iPhone XR and iOS checks (stepper swipe-back on iOS, motion on iOS). Logged for 08.2.
- Phase 08.2's re-audit (seven auditors, household personas, reading test) and 08.1 fixes such as DS-4 "Bought today." placement.
- SN-18's maths (engine maths review), changed-answer reviews other than D3's, Band B (05.5-24), the 05.4-43/45 carry-ins
  (05.5-25), the Maestro nightly.
- Any wording change except P-06; any new feature; store submission; any OTA.

## Pre-start popups (go-aheads; ask before Stage A)

| # | Question (plain English) | Options |
|---|---|---|
| P-07 | Phase 05.5 also needs one phone session (screen sizes, text size, TalkBack). Do both in one sitting? | (a) Yes, one sitting (recommended) / (b) Keep them separate |
| P-08 | May Claude install the new test version of the app on your Pixel 6 over the cable? | (a) Yes, Claude installs it (recommended) / (b) I will install it from a link |
| P-09 | (Only if Stage A finds G-PD-2 not fixed.) The "What is the $X for?" question still appears once after you confirm spare money. Where should the fix go? | (a) In this audit's fix round, with your review of changed answers (recommended) / (b) Add one more 05.5 plan before 05.5 closes |
| P-10 | Speed test on your phone: may Claude run it? It makes two practice checks ("desk lamp 74", "used car 74") and deletes them. Nothing is bought or recorded | (a) Yes, run it (recommended) / (b) Only record my screen while I tap / (c) No, I will just say how it feels |
| P-10c | At the end, may we delete your two old practice items (headphones $180 check and used car $9,000 draft)? | (a) Yes, I will delete them in the session (recommended) / (b) Keep them |
| P-11 | Where should the fix plans live? | (a) A small new phase "05.6 audit fixes" after 05.5 (recommended; check ROADMAP and STATE after insert, known SDK bug) / (b) Extra plans in 05.5 before it closes |
| P-12 | The test account on the emulator. At the end, should we… | (a) Clean up the test items and keep the account for Phase 08.2 (recommended) / (b) Delete the whole test account |
| P-12b | First-answer tap count: use a brand-new test sign-in? | (a) No, count on the existing test account (recommended) / (b) Yes, make a new test sign-in and delete it afterwards |
| P-14 | (Only if PA-56 finds it missing.) The app's new category pictures need one database update before the test build. Apply it? | (a) Yes, apply it now (recommended) / (b) Wait |

## Needs the owner (or orchestrator) before the audit can start

1. Phase 05.5 plans 16, 19, 20 and 22 merged on main (entry criterion 1).
2. The descriptions of G-PD-1 and G-PD-3 (no file on main defines them).
3. Answers to P-07, P-08, P-10, P-10c, P-11, P-12, P-12b (and P-09, P-14 only if triggered).
4. A 45-minute slot with the Pixel 6 connected.

## Owner decisions (2026-11-15)

- **P-09:** the G-PD-2 root fix and the three other engine items (same-day roll-forward, SN-18, `sayLine` `_one` forms) go into **a new 05.5 plan**. The request was posted on PR #115. Stage A checks that they landed.
- **P-11:** the audit's fix plans go into **a new small phase, "05.6 audit fixes"**. After inserting it, check ROADMAP and STATE (known gsd-sdk phase.insert bug).
- **P-07:** **one combined Pixel 6 sitting** for 05.5-23's device session and this audit's Stage B, about an hour in total.
