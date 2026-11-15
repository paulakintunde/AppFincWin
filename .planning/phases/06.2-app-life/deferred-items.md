# Phase 06.2 — deferred items

For the post-05.5 test audit and the audit-fix round. None of these block closing 06.2.

## Device checks (no emulator or device was used in this phase)

1. **Motion on a phone.** Check the calm-motion pieces on the Pixel and the iPhone XR: rise-ins, the once-per-session line draw, ring fills, the goal-reached and debt-cleared moments, and that Reduce Motion draws everything at once.
2. **Toast hand-off.** When one toast replaces another, check the old one's fade does not visibly overlap the new one (Fabric keeps an exiting view at its last place; the new toast waits `DURATION.toastOut`). From 06.2-14.
3. **New-row wash timing.** Check how the Activity wash looks and how long it lasts after a save, and the tap feel with it. From 06.2-11.
4. **Haptics feel.** One meaning each (D-20): tap on save, warning on short or over a cap, success only for goal reached, debt cleared and import done.
5. **Spacing after 06.2-24.** The legacy spacing tokens now read from the six steps (group gap 18 to 28, row padding 15 and 13 to 12, Home card padding 20 to 16, Coming up date column 38 to 36). Check Home, Activity and the entry sheet at 320 dp and font scale 2.0.

## Behaviour follow-ups

6. **Debt-cleared moment for non-sale payoffs.** Only the sale flow marks a debt as cleared. A debt paid off through the "Use once" one-off or recurring payments (balance moves server-side when a line is marked paid in Activity) never plays the moment. Needs the debt's balance after the write in the mark-paid path. From 06.2-21.
7. **"Linked to a check" badge colour.** It stays the plum `StateBadge`; there is no `StatusBadge` status for it. Decide whether it gets a status (tone, icon, word) like the other badges. From 06.2-20.
8. **Open-checks tile vs board L08.** Board L08 draws the item's category icon in a neutral tile; the plan and D-23 say the state icon in the state tint, which is what was built. The owner should pick one. From 06.2-22.

## Release steps (not test items, listed so they are not missed)

9. New dev and preview builds are needed for Lottie (D-25) before any device check.
10. `npm run supabase:db:push` must apply `20261115000100_category_icon_key.sql` to production before any build or OTA with the `categories.icon_key` read reaches a device. From 06.2-17.
11. The CLAUDE.md "Design fidelity" rule and the `src/theme/layout.ts` spacing comment were rewritten in 06.2-24 as proposed edits; the owner accepts or changes them in the PR review.
