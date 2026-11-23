---
phase: 07-insights
verified: 2026-11-23
status: human_needed
score: 5/5 criteria, 6/6 INS requirements, ARC-21/22 and D-24..D-30 verified in code
gaps: []
---

# Phase 7: Insights - Verification

Goal: a user can see the shape of their finances over time. Checked against the code on feat/07-build, not the SUMMARYs. Re-ran 25 suites (274 tests) for engine/health, engine/insights, features/insights, features/levels, insightsCopy: all pass.

## Success criteria

| # | Criterion | Status | Evidence |
|---|---|---|---|
| 1 | Net worth over time, selectable range | VERIFIED | `src/features/insights/sections/NetWorthSection.tsx`, `charts/NetWorthLine.tsx`, `engine/grow/netWorthSeries.ts`; `RangeControl` 6M/1Y/All wired in `InsightsScreen.tsx`; `insightsNetWorth.test.ts`, `netWorthSection.test.tsx` |
| 2 | In/out bars, comparison mode, month vs previous | VERIFIED | `MoneyInOutSection.tsx`, `InOutBars.tsx`, `MonthAgainstLastSection.tsx`, `engine/insights/compare.ts` |
| 3 | Spending by category for a period | VERIFIED | `WhereItWentSection.tsx`, `engine/insights/categories.ts` |
| 4 | Health score with the figures behind it | VERIFIED | `engine/health/score.ts`, `inputs.ts`; `ScoreCard.tsx` lists four parts with points and figures |
| 5 | Activity week/split/balance/calendar | VERIFIED (prior phase) | ACT-06 Complete in REQUIREMENTS.md:148,560; `02.2-VERIFICATION.md` |

## Requirements

| Req | Status | Evidence |
|---|---|---|
| INS-01 | Satisfied | as criterion 1 |
| INS-02, INS-03 | Satisfied | `InOutBars.tsx`; `engine/insights/range.ts` (`barsInRange`, `barTotals`) |
| INS-04 | Satisfied | `categories.ts` |
| INS-05 | Satisfied | `compare.ts`, `MonthAgainstLastSection.tsx` |
| INS-06 | Satisfied | `score.ts`; short cap `HEALTH_SHORT_CAP = 74` |
| ARC-21 | Satisfied | `engine/health/inputs.ts` reads only `homeReading`/`monthPicture`/Decide funds (`funds.emergency`); `engine/health/__tests__/purity.test.ts` passes |
| ARC-22 | Satisfied | scope tests in 07-07 (`insights.test.ts`, `useInsightsScope.test.tsx`) |

## Decisions spot-checked

| Decision | Status | Evidence |
|---|---|---|
| Level gating (L2 Everyday; L3 net worth + score) | VERIFIED | `featureRegistry.ts:51-53` (insights 2, netWorthTrend 3, healthScore 3); `09-LEVEL-MAP.md:52-54`; `InsightsScreen.tsx` gates by `useFeatureAccess`; `availableTabs.ts:17` insights true |
| D-26a (N full months + this month) | VERIFIED | `engine/insights/range.ts` `slice(-(n+1))`; RANGE_MONTHS 6/12/null |
| D-25 parts sum exactly | VERIFIED | `score.ts`: each part rounded half-up once, score is the sum of rounded parts. See warning below for the capped case |
| D-27/D-30 note always present | VERIFIED | `WhereItWentSection.tsx:~144-147` renders `debtSavingNote` unconditionally (outside the single/range branch) |
| D-28 1% grouping | VERIFIED | `categories.ts` `FOLD_BELOW_BP = 100n`; rest row "Everything else" in `WhereItWentSection.tsx` |
| D-29 side labels and month thinning | VERIFIED | `NetWorthLine.tsx:70-77` (three value labels; every third label above 24 points; `labelStep` by width) |
| D-03 short month under 75 | VERIFIED | `score.ts` cap at 74; `score.test.ts` |
| D-04/D-05 no band words, thin data names gap | VERIFIED | `ScoreCard.tsx`, `insightsCopy.test.ts` guard |
| D-18/D-19 scope switch; score Just me only | VERIFIED | `InsightsScreen.tsx` SegmentedControl; `ScoreCard` takes `scope` and `onSwitchToMine` |

## Gaps

None blocking.

Warnings (not gaps):
- When a short month is capped at 74, the four listed parts can add to more than 74. `ScoreCard.tsx` explains this with the line "Decide shows this month as short, so the score stays under 75." Wording is for the Phase 11 sign-off (criterion 12).
- Users with no setup row default to level 4 and see full Insights (07-12 follow-up, by design).
- Mutation run deferred to pre-launch.

## Human verification (phone only)

1. Level 2 user sees the Insights tab with three sections (money in/out, where it went, month against last) and no net worth or score; level 3 sees both.
2. Just me / Household switch changes every chart; the score row says "Your score is in Just me" in Household.
3. Score on the same day matches Decide's reading; a short month shows under 75 and the short line reads clearly.
4. Net worth line: three side labels, month labels never overlap at 6M, 1Y, All; "At today's exchange rates" note.
5. Chart colours legible (D-24) and not the only signal; TalkBack reads each bar, point and summary line.
6. Pixel text fit at 320 dp and 200% font scale; Reduce Motion respected.
7. Offline, loading and empty states.
8. iPhone XR check once Apple enrolment clears.
