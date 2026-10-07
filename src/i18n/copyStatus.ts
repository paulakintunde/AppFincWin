/**
 * D-16 / D-20 copy ownership tracker.
 *
 * AWAITING_COPY_KEYS: welcome copy the user has not supplied yet. These keys ship as
 * clearly marked placeholders in src/i18n/locales/en.ts. The Phase 11 release checklist
 * must see this list empty before shipping — a non-empty AWAITING_COPY_KEYS blocks
 * release.
 *
 * DRAFT_COPY_KEYS: consent/settings/sign-out/update/money/sync copy Claude drafted in the
 * prototype's voice (D-20). It is live and shippable now, but awaits user review before
 * being treated as final — not release-blocking like AWAITING_COPY_KEYS. Excludes
 * money.rate.attribution and credits.exchangeRateApi, which are third-party-mandated text
 * (D-13), not Claude's own drafting.
 *
 * Phase 2 copy (record, activity, accounts, categories, importCsv, history, undo, setup,
 * you.record) is Claude-drafted per 02-UI-SPEC.md's Copywriting Contract and awaits user
 * review before being treated as final (same non-release-blocking convention as Phase 0's
 * draft keys above). `leafPaths` recurses every namespace's leaf strings so no individual
 * key needs listing by hand.
 */
import en from './locales/en';

export const AWAITING_COPY_KEYS: readonly string[] = [];

/** Same recursion as catalogue.test.ts's collectLeaves, kept here so DRAFT_COPY_KEYS can
 * derive whole-namespace key lists without re-listing every leaf by hand. */
function leafPaths(prefix: string, node: unknown): string[] {
  if (typeof node === 'string') {
    return [prefix];
  }
  if (node && typeof node === 'object') {
    return Object.entries(node as Record<string, unknown>).flatMap(([key, value]) =>
      leafPaths(prefix ? `${prefix}.${key}` : key, value)
    );
  }
  return [];
}

export const DRAFT_COPY_KEYS = [
  'consent.heading',
  'consent.body',
  'consent.neverSentHeading',
  'consent.neverSent.amounts',
  'consent.neverSent.payees',
  'consent.neverSent.accounts',
  'consent.neverSent.notes',
  'consent.neverSent.identity',
  'consent.share',
  'consent.decline',
  'consent.saveFailed',
  'you.title',
  'you.section.appearance',
  'you.section.privacy',
  'you.section.connection',
  'you.section.account',
  'you.accent.label',
  'you.accent.green',
  'you.accent.navy',
  'you.accent.rust',
  'you.accent.slate',
  'you.font.label',
  'you.font.bold',
  'you.font.modern',
  'you.font.grotesk',
  'you.font.neutral',
  'you.analytics.label',
  'you.analytics.hint',
  'you.connection.ok',
  'you.connection.checking',
  'you.connection.error',
  'you.signOut',
  'signOut.confirm.body_one',
  'signOut.confirm.body_other',
  'signOut.confirm.cancel',
  'signOut.confirm.proceed',
  'update.heading',
  'update.body',
  'update.cta',
  'money.rate.asOf',
  'money.rate.customAsOf',
  'money.rate.pending',
  'money.fxNote.converted',
  'money.fxNote.kept',
  'money.homeCurrency.title',
  'money.homeCurrency.note',
  'money.customCurrency.title',
  'money.customCurrency.note',
  'money.customCurrency.error.codeMissing',
  'money.customCurrency.error.codeInvalid',
  'money.customCurrency.error.codeExists',
  'money.customCurrency.error.symbolInvalid',
  'money.customCurrency.error.decimalsInvalid',
  'money.customCurrency.error.referenceInvalid',
  'money.customCurrency.error.valueInvalid',
  'money.amountInput.error.empty',
  'money.amountInput.error.invalid',
  'money.amountInput.error.ambiguousSeparator',
  'money.amountInput.error.tooManyDecimals_zero',
  'money.amountInput.error.tooManyDecimals_one',
  'money.amountInput.error.tooManyDecimals_other',
  'money.amountInput.error.tooLarge',
  'money.settings.showCents',
  'money.settings.showCentsHint',
  'money.settings.leadFigure',
  'money.settings.leadHome',
  'money.settings.leadOriginal',
  'sync.offline',
  'sync.offlineQueued_one',
  'sync.offlineQueued_other',
  'sync.queued_one',
  'sync.queued_other',
  'sync.syncedJustNow',
  'sync.syncedMinutes_one',
  'sync.syncedMinutes_other',
  'sync.syncedHours_one',
  'sync.syncedHours_other',
  'sync.syncedDays_one',
  'sync.syncedDays_other',
  'sync.neverSynced',
  'sync.failed_one',
  'sync.failed_other',
  'sync.conflict_one',
  'sync.conflict_other',
  'sync.pendingRow',
  'dev.syncProbe.label',
  ...leafPaths('record', en.record),
  ...leafPaths('activity', en.activity),
  ...leafPaths('accounts', en.accounts),
  ...leafPaths('categories', en.categories),
  ...leafPaths('importCsv', en.importCsv),
  ...leafPaths('history', en.history),
  ...leafPaths('undo', en.undo),
  ...leafPaths('setup', en.setup),
  ...leafPaths('you.record', en.you.record),
  'a11y.toastUndo',
  'a11y.selectRow',
  'a11y.swatch',
  'a11y.dismiss',
] as const;
