# Phase 2 decision record: Activity polish (2026-10-07)

Five gaps found by comparing the built Activity screen with the prototype and `02-UI-SPEC.md`. All five are user decisions made on 2026-10-07. Each landed test-first (a failing `test(02-polish)` commit, then a `fix(02-polish)` commit). No server changes, no migrations, no new colours.

## 1. "Unpaid only" filter and Select all / None

- **What changed:** `ActivityFilter` gained `unpaidOnly` (keeps `status === 'pending'`), `FilterRow` gained `status`, and `isFilterActive` counts it. It combines with direction, category, account and amount. The filter sheet has a Status group with an "Unpaid only" chip. In select mode, "Select all" and "None" appear beside Done; Select all passes only row ids, so a projection can never be selected. `src/engine/activity` stays pure and fully covered (unit and property tests).
- **Why:** the UI-SPEC filter row lists "Unpaid only" but it was not built; `selectAll` existed in the hook with no control.
- **Decision:** add Unpaid only; do not add "Shared lines" (Phase 8).

## 2. Row cards and spacing

- **What changed:** a section's rows form one grouped `surface` card: `radii.card` on the outer corners, `shadows.card` on the outer rows, 13 x 18 padding (`space.rowPadDense`, 18), and a 1px `line1` separator above every row but the first. Position comes from a pure `cardPositions()` helper, so FlashList still renders a flat list with `getItemType`. Mark paid is now a 28pt accent pill beside the amount with an 8pt `hitSlop`, giving a 44pt target (`space.touchMin`) without adding height.
- **Notes:** the screen's 22pt `Screen` padding is the horizontal margin, so no extra margin was added. Middle rows carry no shadow, to avoid stacked shadow bands. The amount repeats the row's press but is hidden from assistive tech, because the row's label already speaks the amount.
- **Decision:** match the prototype's grouped cards and make pending rows slim.

## 3. Small-screen header

- **What changed:** the month switcher has its own row; Accounts / History / You are equal-width shrinking pills (`flex: 1`, `minWidth: 0`, one line, ellipsis) on the next row. The Filter / Select toolbar wraps. The month label ellipsises. The row name truncates and the amount column has `flexShrink: 0`. Tests assert this structure at 320pt and 360pt (Jest has no layout engine, so the structure is checked rather than measured).
- **Decision:** fix the overflow at 320-360pt and large text.

## 4. Placeholder contrast

- **What changed:** search and filter placeholders use `inkMuted` (4.70:1 on `fill1`) instead of `inkFaint` (4.24:1). Added `src/theme/contrast.ts` (WCAG ratio helper) with tests.
- **Out of scope, noted:** other inputs (entry sheet, account sheet and so on) still use `inkFaint`. They sit on `surface`, where it is 4.88:1, so they pass.
- **Decision:** meet WCAG AA with an existing token.

## 5. Colours like the prototype (amends the UI-SPEC colour rule)

- **What changed:** income amounts are `accent` with a leading "+" (spoken labels unchanged); Due, Overdue and Expected tags are `danger`; the Paid section header is `accent`; on account detail a negative balance figure is `danger` and the "still to come" line is `accent` when positive and `danger` when negative.
- **Unchanged by decision:** standing sentences for overdraft / over-limit stay `warn1` with D-49 copy; transfers stay `inkDim`; the queued sync tag stays `inkMuted`; every status keeps its words.
- **Adaptations to the build:** the account detail has no separate "Coming in" / "Going out" rows, only a net "still to come" figure (the data layer sums pending legs, no split), so that one line takes the colour of its sign. The build has no Paid/Received tag and no refund concept, so Paid is the section header and refunds are covered by the rule for when they exist.
- **Contrast:** `danger` on `surface` 5.42, `canvas` 5.19, `fill1` 4.71. All four accents (green 9.64 / navy 11.48 / rust 7.32 / slate 7.12 on `surface`) pass on all three grounds. No darker accent token was needed; this is asserted in `src/theme/__tests__/contrast.test.ts`.
- **Spec:** `02-UI-SPEC.md` Color section carries a dated amendment.
- **Decision:** follow the prototype's colour semantics.
