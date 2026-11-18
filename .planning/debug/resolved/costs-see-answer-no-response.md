---
status: resolved
trigger: "When checking a used car, if nothing was touched for running costs, the See the answer button does not respond, until you change one frequency or until it senses an activity. (Pixel 6, preview 0.2.0 from main 49e64d08)"
created: 2026-11-16
updated: 2026-11-17
---

## Current Focus

hypothesis: The press never reaches onPress on Android (a native touch / hit-region problem), not a JS gate. Every JS path from the Pill to router.push is unconditional and works in tests.
test: Reproduce on a device with logging: add a temporary console.log in CostsStep finishNow and in Pill onPressIn/onPressOut, run a dev client, open a Used car step 3 without touching anything, tap See the answer once.
expecting: If onPressIn fires but onPress does not, the touch is cancelled as "outside the press region" (stale measure after the screen or entering transition). If nothing fires, something covers the button. If finishNow logs, the problem is after the press (navigation).
next_action: Owner checkpoint: allow a device repro (it writes one draft "Used car" check), or run it themselves with adb logcat open.

## Symptoms

expected: One tap on "See the answer" on step 3 of a Used car check, with the pre-filled running costs untouched, opens the answer (and saves the pre-filled lines).
actual: The tap does nothing. After changing one line's frequency (opens and closes the How often sheet) or after some other "activity", the button works.
errors: none reported
reproduction: Pixel 6, preview 0.2.0. Decide, Used car, step 3, change nothing, tap See the answer.
started: reported 2026-11-16 on 0.2.0

## Eliminated

- hypothesis: step.finish waits for a write or flush that never happens when nothing is dirty
  evidence: useStepCheck.finish always calls update (sets held) then flush, which calls save synchronously. Tested: untouched step 3, wait past the 600 ms debounce, press -> save called once more with 5 running-cost lines.
  timestamp: 2026-11-16
- hypothesis: nav.seeAnswer is gated on a saved/flushed state
  evidence: useStepNav.seeAnswer is unconditional: router.back() via backToCaller when from=answer, else router.push(`/decide/answer/${id}`). Tested: push called once.
  timestamp: 2026-11-16
- hypothesis: StepFrame's primary Pill is disabled or debounced until a change
  evidence: CostsStep passes no nextDisabled; Pill is inert only when disabled, pending, or inside a ReadOnlyScope. No debounce in Pill.
  timestamp: 2026-11-16
- hypothesis: the pre-fill write races with navigation or loops (prefill -> save -> base change -> prefill again)
  evidence: With a store that applies saves like onMutate does, the step saves once on arrival (5 lines) and never again; runningCosts round-trip through toStoredV2/readStoredCheck (runningCostOf keeps them).
  timestamp: 2026-11-16
- hypothesis: revisit (pre-fill and visit already stored, so nothing is dirty on arrival) leaves the button dead
  evidence: Tested: 0 saves on arrival, press -> push called once, one save with 5 lines.
  timestamp: 2026-11-16
- hypothesis: an invisible sheet Modal covers the button
  evidence: Sheet returns null when not visible; HowOftenSheet is only mounted while a line is picked.
  timestamp: 2026-11-16

## Evidence

- timestamp: 2026-11-16
  checked: CostsStep.finishNow, useStepCheck.finish/update/flush, useStepNav.seeAnswer, StepFrame, Pill
  found: No branch skips router.push. The only ways for push not to happen are an exception before it (would crash a release build) or onPress never firing.
  implication: The fault is below the JS handler: the touch is not delivered as a press.
- timestamp: 2026-11-16
  checked: Exploratory RNTL test with a live store (saves patch the row, as onMutate does), fresh arrival and revisit
  found: Both press -> push once; saves carry the 5 pre-filled lines.
  implication: Cannot reproduce in jest; the bug needs a device.
- timestamp: 2026-11-16
  checked: What "change a frequency" and "activity" have in common
  found: Both cause a React commit on step 3 after its arrival transition (native-stack slide plus StepFrame's Reanimated SlideInRight). With nothing touched on a revisit, step 3 gets no commit after mount.
  implication: Candidate: Pressability measures the button from the shadow tree; if that is stale after the transition (react-native-screens 4.26.2 / Reanimated 4.5.1 on Fabric), the first tiny finger move marks the press as outside and onPress never fires until a commit refreshes it. Unproven.

## Resolution

root_cause:
fix:
verification:
files_changed: []

## Resolution

- root_cause: On Android the step frame's Reanimated entering layout animation kept the frame at its mount size while the car's pre-filled running costs grew the step, so taps below it (See the answer) fell outside the frame and were dropped until a re-layout (reproduced on the Pixel 6, frame bounds [58,128][1022,259]). This matches the hypothesis above: the press never reached onPress.
- fix: PR #141 (72442ca8, fix(05.5): device fixes from the 0.2.0 Pixel 6 sitting): the step frame slides in by animated style instead of an entering layout animation (StepFrame.tsx, stepper.test.tsx).
- note: this session's notes were committed only on an agent branch (f98ef9df) and filed here on 2026-11-17.
