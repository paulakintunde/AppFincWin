# src/ folder map

This folder holds the real application code, kept separate from the design
prototype handoff at the repo root (`FincWin United.dc.html`, `ios-frame.jsx`,
`support.js`, `doc-page.js`, `BUILD-PROMPT.md`, `screens/`) and from the Expo
Router route tree at `app/`.

Folders are created as each plan needs them — git does not track empty
directories, so this map documents the intended layout ahead of the code
landing in it.

- **`src/engine/`** — pure TypeScript. No React, no React Native, no I/O.
  Must not import from `src/db`, `src/data`, `src/state`, `src/services`,
  `src/ui`, `src/features`, or `react`/`react-native` (FND-04). This is the
  most important boundary in the codebase — it is what lets the financial
  maths (`dplan`, `dassess`, `dmoney`, `dSimMin`, `dpmt`, `dfv`, money,
  rounding, payoff, split) be tested exhaustively and reviewed in isolation.
  Enforced by `eslint-plugin-boundaries` (editor feedback) and
  `dependency-cruiser` (non-bypassable CI gate).
- **`src/db/`** — Supabase client setup, generated types, query/mutation
  builders that talk to Postgres directly.
- **`src/data/`** — TanStack Query hooks, cache persister wiring, paused
  mutations as the offline write queue.
- **`src/state/`** — cross-cutting client state that is not server cache
  (theme selection, session, feature-flag-free UI state).
- **`src/ui/`** — shared design-system primitives: tokens, themed
  components, icons, layout primitives.
- **`src/theme/`** — the design token set, the 4 accents and 4 font
  pairings, live-switching theme context.
- **`src/i18n/`** — typed i18n catalogue and `i18next`/`react-i18next`
  configuration.
- **`src/config/`** — env-driven runtime configuration, feature flags,
  constants that are not secrets.
- **`src/features/`** — feature-scoped screens and logic (Record, Decide,
  Grow, Household, etc.), composed from `src/ui`, `src/state`, `src/data`
  and `src/engine`.
- **`src/services/`** — integrations with third-party SDKs (RevenueCat,
  PostHog, notifications, biometrics) that sit behind their own interface
  so `src/engine` never depends on them.
