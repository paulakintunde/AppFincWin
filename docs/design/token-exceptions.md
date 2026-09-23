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

No other exception exists. Adding one needs a new `CONTEXT.md` decision and a
corresponding update to both this document and `noRawColours.test.ts`'s allow-list.
