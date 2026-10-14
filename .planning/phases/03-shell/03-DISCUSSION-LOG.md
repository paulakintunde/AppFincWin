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

---

# Update session: 2026-10-13

**Why reopened:** Phases 2.2 and 2.3 changed the Sheet, the entry sheet and navigation after these plans were written. A review against main 2956c45 found the sheet migration would undo later decisions. A mockup review found that Home would land empty.

| Area | Options presented | Chosen |
|------|-------------------|--------|
| Sheet engine | Our Sheet, library-ready · Ours only · Migrate to @gorhom | **Our Sheet, library-ready.** Drag is added; one shared interface; @gorhom allowed per sheet later. The user asked for a plain-language explanation first. |
| Drag zone | Handle + header, body at top · Handle and header only · Anywhere | Handle + header, body at top |
| Heights | Fit content, capped · Snap points | Fit content, capped |
| Backdrop colour | Mockup ink at 38% · Keep black at 40% | Mockup ink at 38% (black token removed) |
| Backdrop fade | Fade in 0.18s · No fade | Fade in 0.18s |
| Close motion | Match the mockup · Always slide down · Always instant | Match the mockup: taps instant, drag slides away |
| Backdrop strength | One value everywhere · Mockup's three values | One value everywhere |
| Entry sheet, accidental dismissal | Keep as draft · Ask "Discard changes?" · Discard silently | Keep as draft (form + list) |
| Other edit sheets | Ask "Discard changes?" · Discard silently | Ask, only when changed |
| Cancel with input | Discard, ask only for a list · Always ask | Discard; ask only for a list |
| Toasts while a sheet is open | Above the sheet · Under the sheet | Above the sheet |
| Sheet over sheet | Stack on top, return on close · Replace, then return | Stack on top, return on close |
| Back/drag with a stack | Top sheet only · Whole stack | Top sheet only |
| Home content | Build in Phase 3 · New phase after 3 · Land on Activity | Build in Phase 3 (HOME-01…04) |
| Shell details from the mockup | Details cover the tab bar · Back slides in reverse · Refresh completion toast · Pay bills shortcut | All four |
| Unassigned mockup features to the backlog | Split across categories · Receipt photo · Envelope rollover · Coach + custom types | All (999.1–999.5) |

## Deferred (backlog)

- 999.1 Split a transaction across categories
- 999.2 Receipt photo
- 999.3 Envelope rollover
- 999.4 Coach
- 999.5 Custom payment and account types
