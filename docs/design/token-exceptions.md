# Design token exceptions

DSG-02 requires that the §2 token set (`src/theme/tokens.ts`, `src/theme/accents.ts`) is
the complete palette — no gradients, no extra shadows, no additional colours, no
substituted icon set. `src/theme/__tests__/noRawColours.test.ts` enforces this
automatically on every commit. This document records the single sanctioned exception so
that check doesn't flag it as a regression.

## DSG-02 exception (D-12): platform sign-in brand marks

The official **Sign in with Apple** button (Apple's black, Apple's logo) and the
**Google "G" mark** (Google's four brand colours) render per Apple's Human Interface
Guidelines and Google's own branding guidelines, not FincWin's token palette. Both
providers require their marks to be reproduced exactly, unmodified except where their
own guidelines explicitly allow (for Apple, corner radius only).

They live only in:
- `src/features/auth/brand/` — the one folder `noRawColours.test.ts` skips
- the native `AppleAuthenticationButton` component (its colours are drawn by the OS,
  not by FincWin code, so no literal appears in the app's source at all)

## DSG-02 exception (09-26, owner 2026-11-19): two member colours

Member colours grow from 6 to 12 for the Extended plan (up to 12 people, each with their
own colour). Navy, Brown, Charcoal and Brick reuse hexes already in the token files.
Magenta `#A62D8C` and Orange `#A65600` are new owner-approved hexes. They live only in
`memberColors` in `src/theme/tokens.ts`, are listed in `noRawColours.test.ts`
ALLOWED_HEXES, and are tested in `src/theme/__tests__/memberColours.test.ts` (white text
6.22 and 5.31, 4.5:1 or better on every ground, CIEDE2000 12 or more from every other
member colour). They are member identity colours only, never state, accent or page
colours, and always appear with the member's name or colour word.

Two exceptions exist (D-12 and 09-26, both above). Adding another needs a new `CONTEXT.md` decision and a
corresponding update to both this document and `noRawColours.test.ts`'s allow-list.
