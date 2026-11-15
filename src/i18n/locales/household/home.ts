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
    summaryLink: 'Read-only summary link',
  },
  scope: {
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
} as const;
