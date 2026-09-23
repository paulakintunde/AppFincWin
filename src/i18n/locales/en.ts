/**
 * The Phase 0 English catalogue. Every user-facing string a Phase 0 screen renders lives
 * here — DSG-04 requires a typed t() that rejects unknown keys at compile time, and the
 * eslint-plugin-i18next no-literal-string rule (00-05) forces screens to read strings
 * through this catalogue rather than inlining JSX text.
 *
 * Typographic apostrophes (’) throughout, never a straight apostrophe (').
 *
 * Copy ownership (see copyStatus.ts):
 * - AWAITING USER COPY (D-16): welcome-screen copy the user has not supplied yet. Ships as
 *   a clearly marked placeholder so the screen renders and is swappable later.
 * - Everything else in consent.*, you.*, signOut.*, update.* is Claude-drafted in the
 *   prototype's voice (D-20) and awaits user review before being treated as final.
 *
 * Compliance (CLAUDE.md): never "advice", "recommendation", "you should", and never a
 * claim that data stays on the device — FincWin is cloud-first (D-15).
 */
const en = {
  auth: {
    welcome: {
      wordmark: 'FincWin',
      // AWAITING USER COPY (D-16): placeholder only, do not invent final copy.
      tagline: '[one line under the wordmark — user to supply]',
    },
    apple: {
      cta: 'Sign in with Apple',
      pendingEnrolment: 'Apple sign-in arrives once our developer account is verified.',
    },
    google: {
      cta: 'Continue with Google',
    },
    error: {
      signInFailed: 'Sign-in didn’t go through. Try again.',
    },
  },
  consent: {
    heading: 'Share anonymous usage?',
    body: 'Helps us see where the app is confusing — never your amounts, payees or account names. Change this anytime in settings.',
    neverSentHeading: 'Never sent',
    neverSent: {
      amounts: 'Amounts and balances',
      payees: 'Payees and merchants',
      accounts: 'Account names',
      notes: 'Notes, or anything you type',
      identity: 'Your name or email',
    },
    share: 'Share usage',
    decline: 'Not now',
  },
  you: {
    title: 'You',
    section: {
      appearance: 'Appearance',
      privacy: 'Privacy',
      connection: 'Connection',
      account: 'Account',
    },
    accent: {
      label: 'Accent',
      green: 'Green',
      navy: 'Navy',
      rust: 'Rust',
      slate: 'Slate',
    },
    font: {
      label: 'Font pairing',
      bold: 'Bold',
      modern: 'Modern',
      grotesk: 'Grotesk',
      neutral: 'Neutral',
    },
    analytics: {
      label: 'Share anonymous usage',
      hint: 'Never amounts, payees or account names.',
    },
    connection: {
      ok: 'Connected to Supabase',
      checking: 'Checking connection…',
      error: 'Not connected — check your internet connection.',
    },
    signOut: 'Sign out',
  },
  signOut: {
    confirm: {
      body_one: '{{count}} change not yet saved. Signing out clears the encrypted cache and everything queued on this device.',
      body_other: '{{count}} changes not yet saved. Signing out clears the encrypted cache and everything queued on this device.',
      cancel: 'Cancel',
      proceed: 'Sign out anyway',
    },
  },
  update: {
    heading: 'Update needed',
    body: 'This version is behind. Update FincWin to keep using it.',
    cta: 'Update now',
  },
  a11y: {
    close: 'Close',
    back: 'Back',
  },
} as const;

export default en;
