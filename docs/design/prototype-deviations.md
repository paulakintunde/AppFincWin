# Prototype deviations (checked by DSG-01 screenshot parity)

DSG-01 (Phase 11) compares rendered screens with the prototype. These differences are deliberate; do not flag them as regressions.

| # | Area | Prototype | App | Decision / reason |
|---|------|-----------|-----|-------------------|
| 1 | Tab order | Home · Activity · Grow · Decide · Insights | Home · Activity · Decide · Grow · Insights | 03-CONTEXT D-01: Decide takes the centre slot (LAUNCH-POSITIONING §1-2); glyphs unchanged |
| 2 | Hidden tabs | all five always shown | tabs appear as their phase ships | D-02 |
| 3 | Sheet engine | hand-rolled pointer-drag sheet | the app's own src/ui/Sheet.tsx with drag added; no @gorhom/bottom-sheet, no snap points | D-12, D-12c |
| 4 | Backdrop | rgba(20,21,15,.38) | ink at 0.38 opacity (no rgba literal); colors.scrim (black .4, quick 261013-izi) removed, palette strictly §2; stacked sheets darken by layering | D-23 |
| 5 | Dropdown menus | no dim | same ink-at-0.38 backdrop | D-37 |
| 6 | You | a tab-like state | pushed from every tab root's avatar | D-04 |
| 7 | Detail push | fw-push 26px shift + fade | native stack slide (Android slide_from_right, iOS default), covering the tab bar | NAV-03, D-07, D-22 |
| 8 | Back-step direction | goBack dir -1 | same: back always slides from the left | D-05 |
| 9 | Toast Undo colour | #9BC0B2 | surface, label role 13/600 | UI-SPEC Color: accent is user-themeable |
| 10 | Toast shadow | 0 12px 30px -12px | none | design-fidelity rule |
| 11 | Toast offset | literal 104px | tab-bar height + 12, or insets.bottom + 30 without a bar | DSG-03, D-16 |
| 12 | Sync status | filled full-bleed banner (html 50) | slim SyncStatusLine only when something is wrong | D-15 |
| 13 | Home order | net worth, quick actions, health, Accounts, This month, Coming up | quick actions, This month, Coming up, Accounts; no net worth or health yet | D-30, D-31 |
| 14 | Home pending bar | #C8D6CD | accent at 0.3 opacity | no new colour |
| 15 | Quick-action glyphs | text characters + ↑ ⇪ | hand-drawn shapes | no icon font |
| 16 | Type mappings | 30, 17, 15.5, 14.5, 14, 12 px | nearest declared sizes (UI-SPEC Typography) | closed type scale |
| 17 | Tab-root title face | display face -.025em | heading role (body face 700) | 02-UI-SPEC precedent |
| 18 | Tab bar blur on Android | blur(14px) | may render as the flat tabBar translucent token | expo-blur Android fallback |
