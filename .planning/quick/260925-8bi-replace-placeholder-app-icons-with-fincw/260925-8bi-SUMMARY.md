---
phase: quick-260925-8bi
plan: 01
subsystem: infra
tags: [expo, app-icon, adaptive-icon, pillow, svg, brand]

requires: []
provides:
  - "Master FincWin 'F' glyph as two source SVGs (transparent mark + full-bleed app-icon)"
  - "Re-runnable, idempotent Pillow generator for every icon PNG size/variant"
  - "Regenerated icon.png, Android adaptive icon set (foreground/background/monochrome), splash-icon, favicon"
  - "android.adaptiveIcon wired into app.config.ts"
affects: [release, compliance]

tech-stack:
  added: []
  patterns:
    - "Single geometry constant table (STEM/ARM/BLOCK, GLYPH_UNITS=480, RADIUS=68) drives both the master SVGs and the Pillow-rendered PNGs, so icon.png/adaptive-icon/splash/favicon can never drift from each other"
    - "Supersample-then-LANCZOS-downscale rendering (8x for <64px, 4x otherwise) for antialiased rounded corners without an SVG rasterizer dependency"

key-files:
  created:
    - assets/brand/fincwin-mark.svg
    - assets/brand/fincwin-app-icon.svg
    - scripts/brand/generate-icons.py
  modified:
    - assets/icon.png
    - assets/android-icon-foreground.png
    - assets/android-icon-background.png
    - assets/android-icon-monochrome.png
    - assets/splash-icon.png
    - assets/favicon.png
    - app.config.ts

key-decisions:
  - "Brand colours navy #172A4F, coral #FF6F61, cream #F7F4E9 are confined to assets/brand/*.svg and scripts/brand/generate-icons.py only — they sit outside the §2 in-app token palette and must never appear in src/app/ui/theme"
  - "icon.png is saved via .convert('RGB') with no alpha channel specifically to avoid an App Store upload rejection; the generator asserts this on every run"
  - "Android foreground/monochrome glyph is rendered at 340px within the 1024px canvas (~33%), keeping the glyph's ~481px diagonal inside the 626px (66/108) safe circle"

requirements-completed: [QUICK-260925-8bi]

duration: 25min
completed: 2026-09-25
---

# Quick Task 260925-8bi: Replace placeholder app icons with FincWin F mark Summary

**Replaced Expo's default icon set with a vector-exact FincWin "F" mark (navy stem+arm, coral block on cream), generated from one re-runnable Pillow script and wired into app.config.ts's Android adaptiveIcon.**

## Performance

- **Duration:** ~25 min
- **Completed:** 2026-09-25
- **Tasks:** 2 completed
- **Files modified:** 10

## Accomplishments
- Two master SVGs (`assets/brand/fincwin-mark.svg`, `assets/brand/fincwin-app-icon.svg`) encode the exact stem/arm/block geometry pixel-for-pixel, no tracing or resampling of the reference screenshot
- `scripts/brand/generate-icons.py` regenerates all six PNGs from one geometry constant table (`STEM`, `ARM`, `BLOCK`, `RADIUS`, `GLYPH_UNITS`); verified idempotent (`git diff --stat` empty after a second run) and self-verifying (asserts size/mode/alpha on every run, exits non-zero on failure)
- `assets/icon.png` is confirmed RGB with no alpha channel (App Store upload safety)
- `app.config.ts`'s `android.adaptiveIcon` now wires `foregroundImage`, `backgroundImage`, `monochromeImage`; splash `backgroundColor` (#FBFAF7) and `imageWidth` (160) left untouched
- Contact-sheet preview generated and visually compared against the user's reference logo screenshot — matches on stem/arm/block proportions, gaps, corner radii (only stem TL/BL and arm TR rounded), and colours

## Task Commits

1. **Task 1 + Task 2 (bundled per plan's explicit instruction): Master SVGs, icon generator, regenerated PNGs, adaptiveIcon wiring** - `3020470` (chore)

_Note: the plan's Task 2 action explicitly directed staging both tasks' files (SVGs, script, six PNGs, app.config.ts) into a single commit — followed as written rather than splitting into two commits._

## Files Created/Modified
- `assets/brand/fincwin-mark.svg` - Master 480x480 glyph, transparent background, navy stem+arm / coral block
- `assets/brand/fincwin-app-icon.svg` - 1024x1024 full-bleed cream square with the glyph centred, for reference/hand-editing
- `scripts/brand/generate-icons.py` - Re-runnable Pillow generator: `render_glyph()`, `compose()`, size/mode/alpha assertions, `--preview` contact-sheet mode
- `assets/icon.png` - 1024x1024 RGB (no alpha), cream background, glyph centred
- `assets/android-icon-foreground.png` - 1024x1024 RGBA transparent, glyph at 340px
- `assets/android-icon-background.png` - 1024x1024 RGBA, opaque cream fill
- `assets/android-icon-monochrome.png` - 1024x1024 RGBA transparent, white glyph at 340px
- `assets/splash-icon.png` - 1024x1024 RGBA transparent, glyph at 800px (splash plugin scales to imageWidth 160)
- `assets/favicon.png` - 48x48 RGBA, cream rounded tile (radius 11) with glyph at 23px
- `app.config.ts` - `android.adaptiveIcon` added with the three new PNG paths

## Decisions Made
- Followed the plan's literal geometry constants without opening or sampling the reference screenshot, per the plan's explicit instruction — geometry came solely from the interface block's coordinates
- Bundled Task 1 and Task 2's file staging into the single commit the plan's Task 2 action explicitly specified, rather than two separate atomic commits
- See `key-decisions` in frontmatter for the RGB-no-alpha and 340px-safe-circle decisions

## Deviations from Plan

None — plan executed exactly as written. Geometry, colours, output paths, assertions, and the adaptiveIcon wiring all match the plan's interfaces block verbatim.

## Issues Encountered
- `npm run lint` (full repo) surfaced 44 pre-existing errors and 53 warnings in unrelated files (`src/engine/**`, `src/i18n/index.ts` — `no-var` and `import/no-named-as-default-member`), none touched by this task. Confirmed out of scope per the deviation rules' scope boundary: `app.config.ts` lints clean in isolation (`npx eslint app.config.ts` — zero output), and no file this task touched contributed to those errors. Not fixed; not logged to a deferred-items.md since this is a quick task with no phase directory and the errors predate this change entirely.

## User Setup Required

None - no external service configuration required. One note for the user, per plan instruction:

**The icon change only reaches a device via a new native build (EAS dev or production build) — OTA/EAS Update cannot change the app icon.** The next `eas build` for either platform will pick up the new `assets/icon.png` and the Android adaptive icon set automatically; no separate action needed beyond that build.

The reviewable contact-sheet preview lives at `.planning/quick/260925-8bi-replace-placeholder-app-icons-with-fincw/icon-preview.png` (not committed to the repo — preview artifact only, regenerate any time with `python scripts/brand/generate-icons.py --preview <path>`).

## Next Phase Readiness
- Icon set is complete, regenerable, and wired into config; ready for the next native build (EAS dev/prod) to pick it up on-device
- No blockers introduced by this task

---
*Quick task: 260925-8bi*
*Completed: 2026-09-25*

## Follow-up (2026-09-25): colours changed by the user

The user changed the brand colours after this task landed: the block is now green `#076D46` (was coral `#FF6F61`) and the tile is white `#FFFFFF` (was cream `#F7F4E9`). Navy `#172A4F` is unchanged. The generator's constants were renamed `ACCENT`/`TILE`, the master SVGs were updated, and every PNG was regenerated from the script. These are still brand-asset colours only; no in-app token uses them.
