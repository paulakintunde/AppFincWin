/**
 * 08-12: Household home copy (UI-SPEC Screens 1, 2, 9 and empty/error states). Declarative, never advice.
 * Interpolation: {{name}}, {{household}}, {{amount}}, {{count}}, {{date}}, {{currency}}, {{time}}.
 */
export const home = {
  title: 'Household',
  sublabel: '{{count}} people · amounts in {{currency}}',
  youRowSublabel: '{{household}} · {{count}} people',
  youRowAlone: 'Just you',
  rename: 'Rename',
  notices: 'Notices',
  recentChanges: 'Recent changes',
  seeAll: 'See all',
  sentence: {
    owesYou: '{{name}} owes you {{amount}}.',
    youOwe: 'You owe {{name}} {{amount}}.',
    square: 'Everyone is square in {{household}}.',
    owedAcross: 'You are owed {{amount}} across {{count}} people.',
  },
  unpaidNote: 'A further {{amount}} sits in shared lines that are still unpaid, so it is not counted yet.',
  footer:
    'Your records stay private. Only lines you mark shared are seen by {{household}}. Your Decide checks are never shared. FincWin records who owes whom. It holds no money and moves none.',
  offline: {
    asOf: 'Offline · as of {{time}}',
    helper: 'Needs a connection. Try again when you’re back online.',
    liveUpdatesPaused: 'Live updates paused. Reconnecting.',
    cachedAsOf: 'As of {{time}}',
    updatedJustNow: 'Updated just now',
    noCache: 'You’re offline. Connect to load this.',
  },
  empty: {
    title: 'Just you for now',
    body: 'Invite the people you share money with. Each person keeps their own records private.',
    invite: 'Invite someone',
    haveCode: 'Have a code?',
  },
  people: {
    invite: '+ Invite someone',
    full: 'A household holds up to 6 people.',
    fullSend: '{{household}} already has 6 people. Remove someone before inviting another.',
  },
  invites: {
    sent: 'Invite sent · expires {{date}}',
    validForOne: 'Valid for one person',
    copyLink: 'Copy link',
    cancel: 'Cancel invite',
    cancelled: 'Invite cancelled',
  },
  rules: {
    howSplit: 'How new shared lines are split',
    categoryDefaults: 'Category defaults',
    sharedAccounts: 'Shared accounts',
    // 08.1-23 (Q1): draft copy, wording sign-off in plan 14.
    spending: 'How spending is split',
  },
  // 08.1-23 (Q9): joint accounts with no purpose yet. Draft copy, wording sign-off in plan 14.
  purposeMissing_one: '{{count}} joint account doesn’t have a purpose set yet. Until then, it counts as everyday spending.',
  purposeMissing_other: '{{count}} joint accounts don’t have a purpose set yet. Until then, they count as everyday spending.',
  purposeMissingAction: 'Go to Shared accounts',
  scope: {
    /** 08-25: the switch's group name for screen readers. */
    a11y: 'Whose figures to show',
    mine: 'Mine',
    household: 'Household',
    mineLabel: 'Your records plus your share of shared lines',
    householdLabel: 'Shared lines only, in {{currency}}',
    paid: '{{name}} paid {{amount}}',
  },
  rename_sheet: {
    title: 'Rename household',
    label: 'Household name',
    save: 'Save name',
    toast: 'Household renamed',
  },
  currencySheet: {
    title: 'Household currency',
    helper: 'Shared amounts are shown and settled in this currency.',
    save: 'Save currency',
    saved: 'Household currency set to {{code}}',
    sharedLinesExist:
      'The currency can’t change while shared lines exist. Shared lines are recorded in {{currency}}, and changing it would alter what people owe.',
  },
  balances: {
    emptyTitle: 'Everyone is square',
    emptyBody: 'Nothing is owed in {{household}} right now.',
    owesYou: 'owes you {{amount}}',
    youOwe: 'you owe {{amount}}',
    square: 'square',
    linesBehind: 'Lines behind this',
    linesBehindEmptyTitle: 'No lines behind this',
    linesBehindEmptyBody: 'Shared lines you both log will appear here.',
    traces: 'Every amount traces back to these lines.',
    notSpendable: 'Not spendable until it arrives',
    lineMeta: '{{date}} · {{rule}} · paid by {{name}}',
    yourShare: 'your share {{amount}}',
  },
  changesEmptyTitle: 'Nothing has changed yet',
  changesEmptyBody: 'Joins, split changes and settle-ups show up here.',
  loadFailed: {
    title: 'Couldn’t load this right now',
    body: 'Your records are safe. Check your connection and try again.',
    retry: 'Try again',
  },
  back: 'Back',
  /** 08-17: the home screen and owner sheets. */
  unnamed: 'Your household',
  noticesUnread: 'Notices, {{count}} unread',
  roleOwner: 'Owner',
  pendingInvites: 'Pending invites',
  linkCopied: 'Link copied',
  restoreFailed: 'The invite couldn’t be brought back. Make a new one.',
  reasons: {
    not_owner: 'Only the owner can do this.',
    full: '{{household}} already has 6 people. Remove someone before inviting another.',
    try_again: 'A code couldn’t be made just now. Try again.',
    version_conflict: 'Someone else changed this first, so your change wasn’t saved. The latest is shown.',
    invalid_name: 'A name needs 1 to 60 characters.',
    unknown_currency: 'That currency isn’t available.',
    not_found: 'This invite is no longer there.',
    window_closed: 'The 24 hours to invite again have passed.',
    already_restored: 'This person is already back.',
    failed: 'This wasn’t saved. Try again.',
  },
} as const;
