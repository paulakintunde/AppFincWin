# Phase 3: Shell - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-26
**Phase:** 03-shell
**Areas discussed:** Tabs, order & unbuilt tabs · Back behaviour · Floating button actions · Sheets & accessibility · Header & avatar · Toast placement · Pull-to-refresh · Haptics

---

## Tabs, order & unbuilt tabs

| Question | Options | Selected |
|---|---|---|
| Tab order (prototype puts Decide 4th of 5) | Decide in the centre · Keep the prototype order · Decide first | Decide in the centre |
| Tabs whose phase hasn't shipped | Hide until built · Placeholder screens · Placeholder in dev builds only | Hide until built |
| Levels hiding whole tabs | No, tabs are always there · Yes, hide tabs by level · Decide in Phase 9 | No, tabs are always there |
| Where You lives | Avatar, top right · Make it a sixth tab | Avatar, top right |

## Back behaviour

| Question | Options | Selected |
|---|---|---|
| History model | One app-wide history of 8 · Native per-tab stacks · Tabs only, as prototype | One app-wide history of 8 |
| Android back order | Sheet, then history, then Home, then exit · Sheet, then history, then exit | Sheet, then history, then Home, then exit |
| iOS edge swipe | Detail screens only · Detail screens and tab history | Detail screens only |
| Re-tapping the active tab | Pop to root, then scroll to top · Nothing | Pop to root, then scroll to top |

## Floating button actions

| Question | Options | Selected |
|---|---|---|
| Home action | 'Add', a transaction · 'New check' | 'Add', a transaction |
| Grow action | Follows the Grow view · 'Add' transaction everywhere | Follows the Grow view |
| Insights | Show 'Add' · Hide it | Show 'Add' |
| Long-press | Quick menu · No long press | Quick menu |

## Sheets & accessibility

| Question | Options | Selected |
|---|---|---|
| Dragging a sheet with unsaved changes | Ask 'Discard changes?' · Keep a draft · Dismiss and lose it | Ask 'Discard changes?' |
| Sheets vs full screens | Short tasks sheets, flows full screens · Mirror the prototype exactly | Short tasks sheets, flows full screens |
| Text scale cap (DSG-07) | Body to 200%, big numbers capped · Cap everything at 1.35× · No cap | Body to 200%, big numbers capped |
| Screen-reader focus | Focus the new screen's title · You decide | Focus the new screen's title |

## Header & avatar, toast, refresh, haptics

| Question | Options | Selected |
|---|---|---|
| Sync status line | Only when something's wrong · You screen only · Always under the header | Only when something's wrong |
| Large title on scroll | Scroll away, compact title fades in · Static, as prototype | Scroll away, compact title fades in |
| Toast vs floating button | Button lifts above the toast · Button hides during a toast · Toast at the top | Button lifts above the toast |
| Pull-to-refresh | Native control, main lists · Custom prototype pull · No pull-to-refresh | Native control, main lists |
| Shell haptics | Minimal set · Add a tab-change tick · None in the shell | Minimal set |

## Claude's Discretion

- How the unified history is built on Expo Router.
- The floating-button registration API and the reporting of unsaved changes to the sheet guard.
- Exact timings and easings (default to the prototype's), and the floating button's lift animation.

## Deferred Ideas

- The app-switcher privacy snapshot (DSG-08), which sits in Phase 10.
- Feature haptics, which belong to their own phases.
