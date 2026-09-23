/**
 * D-16 / D-20 copy ownership tracker.
 *
 * AWAITING_COPY_KEYS: welcome copy the user has not supplied yet. These keys ship as
 * clearly marked placeholders in src/i18n/locales/en.ts. The Phase 11 release checklist
 * must see this list empty before shipping — a non-empty AWAITING_COPY_KEYS blocks
 * release.
 *
 * DRAFT_COPY_KEYS: consent/settings/sign-out/update copy Claude drafted in the
 * prototype's voice (D-20). It is live and shippable now, but awaits user review before
 * being treated as final — not release-blocking like AWAITING_COPY_KEYS.
 */

export const AWAITING_COPY_KEYS = ['auth.welcome.tagline'] as const;

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
] as const;
