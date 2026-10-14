---
status: partial
phase: 03-shell
source: [03-VERIFICATION.md]
started: 2026-10-14T23:00:00Z
updated: 2026-10-14T23:00:00Z
---

## Current Test

[awaiting human testing: blocked on Apple Developer Program enrolment (iOS development build needed)]

## Tests

### 1. I1 Native edge swipe (iPhone XR, D-07)
expected: The native iOS edge swipe pops detail screens only. It does nothing on Home or Activity.
result: [pending]

### 2. I2 VoiceOver (iPhone XR, D-20)
expected: Tabs read with their position and selected state. Changing tab or pushing a screen moves focus to the title. A sheet announces its title, keeps focus and offers an escape (two-finger Z) that closes it. A toast over a sheet is announced without moving focus.
result: [pending]

### 3. I3 Largest Dynamic Type (iPhone XR, D-19)
expected: At the largest Dynamic Type setting, body text is about 2x and wraps without clipping. Tab labels and Home figures are capped at about 1.3x. Typed text in inputs is capped.
result: [pending]

### 4. I4 Scroll-bounce while dragging (iPhone XR, Pitfall 7)
expected: Dragging a sheet whose body is at the top does not rubber-band the content.
result: [pending]

## Summary

total: 4
passed: 0
issues: 0
pending: 4
skipped: 0
blocked: 4

## Gaps
