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
 * - Everything else in consent.*, you.*, signOut.*, update.*, money.*, sync.* is
 *   Claude-drafted in the prototype's voice (D-20) and awaits user review before being
 *   treated as final, except money.rate.attribution and credits.exchangeRateApi, which are
 *   third-party-mandated text (D-13) and must not be paraphrased. Both read the single
 *   constant in ../mandatedCopy.ts, cross-checked against fx-sync's copy by a test.
 * - money.fxNote.converted/kept, money.homeCurrency.title/note, money.customCurrency.title,
 *   money.customCurrency.error.codeMissing/codeExists, money.settings.showCents,
 *   sync.offlineQueued_one/other and sync.syncedMinutes_one/other are ported verbatim from
 *   the prototype (with placeholders replacing its inline values).
 * - money.customCurrency.note and .error.valueInvalid adapt the prototype's "worth in USD"
 *   wording to the user's own chosen reference currency (D-07) rather than hard-pinning USD.
 * - money.settings.showCentsHint changes from the prototype's "Two decimals everywhere" to
 *   "Decimals on every amount" because JPY has no decimal places and KWD has three (MON-13),
 *   so "two" is not universally true.
 * - money.amountInput.error.* covers every `parseAmount` error code (src/ui/money/
 *   useAmountParser.ts is the only caller). `ambiguousSeparator`'s `{{example}}` is not a
 *   fixed string: it is the caller's resolved locale formatting a fixed probe amount, so the
 *   shown example always matches the region whose separators rejected the input (WR-A10,
 *   RD-02) rather than a hardcoded '.'/',' convention.
 *
 * Compliance (CLAUDE.md): never "advice", "recommendation", "you should", and never a
 * claim that data stays on the device — FincWin is cloud-first (D-15).
 */
import { EXCHANGE_RATE_API_ATTRIBUTION } from '../mandatedCopy';

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
  money: {
    rate: {
      asOf: 'Rate of {{date}}',
      customAsOf: 'Your rate, set {{date}}',
      pending: 'Rate pending',
      attribution: EXCHANGE_RATE_API_ATTRIBUTION,
    },
    fxNote: {
      converted:
        'Saves as {{home}} in {{homeCode}} at {{unit}} = {{rate}}. The original {{original}} stays on the record.',
      kept: 'Kept in {{code}}. Totals convert at {{unit}} = {{rate}}.',
    },
    homeCurrency: {
      title: 'Home currency',
      note: 'Every total converts into this. Foreign lines keep their own amount and show both.',
    },
    customCurrency: {
      title: 'Add a currency',
      note: 'Code, symbol and what one unit is worth in {{reference}}. It is selected for this entry straight away.',
      error: {
        codeMissing: 'Give the currency a code.',
        codeInvalid: 'Use 2 to 4 letters or digits for the code.',
        codeExists: '{{code}} already exists.',
        symbolInvalid: 'Keep the symbol to 4 characters.',
        decimalsInvalid: 'Choose 0 to 4 decimal places.',
        referenceInvalid: 'Pick a currency to value it against.',
        valueInvalid: 'Enter what one unit is worth in {{reference}}.',
      },
    },
    amountInput: {
      error: {
        empty: 'Type an amount.',
        invalid: 'That isn’t an amount.',
        ambiguousSeparator: 'That doesn’t match how amounts are written here — try {{example}}.',
        tooManyDecimals_zero: 'No decimal places here.',
        tooManyDecimals_one: 'Up to {{count}} decimal place here.',
        tooManyDecimals_other: 'Up to {{count}} decimal places here.',
        tooLarge: 'That amount is too large.',
      },
    },
    settings: {
      showCents: 'Show cents',
      showCentsHint: 'Decimals on every amount',
      leadFigure: 'Lead with',
      leadHome: 'Home currency',
      leadOriginal: 'Original currency',
    },
  },
  sync: {
    offline: 'offline',
    offlineQueued_one: 'offline · {{count}} change queued',
    offlineQueued_other: 'offline · {{count}} changes queued',
    queued_one: '{{count}} change queued',
    queued_other: '{{count}} changes queued',
    syncedJustNow: 'synced just now',
    syncedMinutes_one: 'synced {{count}} minute ago',
    syncedMinutes_other: 'synced {{count}} minutes ago',
    syncedHours_one: 'synced {{count}} hour ago',
    syncedHours_other: 'synced {{count}} hours ago',
    syncedDays_one: 'synced {{count}} day ago',
    syncedDays_other: 'synced {{count}} days ago',
    neverSynced: 'not synced yet',
    failed_one: '{{count}} change couldn’t save',
    failed_other: '{{count}} changes couldn’t save',
    conflict_one: '{{count}} edit couldn’t save — changed elsewhere',
    conflict_other: '{{count}} edits couldn’t save — changed elsewhere',
    pendingRow: 'queued',
  },
  credits: {
    exchangeRateApi: EXCHANGE_RATE_API_ATTRIBUTION,
  },
  a11y: {
    close: 'Close',
    back: 'Back',
  },
} as const;

export default en;
