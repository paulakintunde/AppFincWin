# Stage B result: owner Pixel 6 check after 05.5 (2026-11-19)

**Build:** preview APK 95fa2fc5 (main 75ca4a83). **Who:** the owner, on their own Pixel 6, no cable.
**Where the marks live:** check page https://claude.ai/artifact/1bdSpYZ7uFYTGh17dNTeek (private; db collection `results`).

**Result: 27 of 28 passed, none failed, 1 carried.** No fix is needed from this session.

| Steps | Rows | Result |
|---|---|---|
| 1-4 Home and Activity | L-rows (06.2) | pass |
| 5-8 Decide home | PA-34, haptics | pass |
| 9 answer months = Records months | PA-19 (DS-10) | pass (after a clearer guide was added to the page) |
| 10-13 sheets and Back | PA-33, PA-13, PA-38, PA-37 | pass |
| 14-17 editing the check | PA-17, PA-30 | pass |
| 18-19 speed | PA-12 | pass, timed by hand: answer 0.8 s (limit 2 s), Next 0.2 s, Pay page 0.3 s (limits 1 s) |
| 20 tap after a save | PA-35 | **carried**: needs the cable (`p6-idle.yaml`); not judged by eye |
| 21-23 TalkBack | PA-22-type rows | pass |
| 24-25 Remove animations | calm motion | pass |
| 26-28 clean-up | PA-28 | pass |

Notes:
- The speed numbers are hand timings, not the Maestro `p6-timing.yaml` figures; they sit far inside every limit, so the
  owner accepted them. `decide_tab_open`, `stepper_back`, `past_open`, `rule_sheet_open` and `net_settings_open` were not recorded.
- Owner feedback for the checklist itself: say exactly where each number is (step 9) and give the full Settings path
  (step 24). Both were added to the page.
- Carried to the next cable session: step 20 (PA-35) and the full `p6-timing` record.
