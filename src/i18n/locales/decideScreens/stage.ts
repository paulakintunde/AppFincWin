/**
 * 08.1-20: Decide stages by data. Owner plan 08.1-20 (keys used by 08.1-20 and 08.1-21). Draft, signed in 08.1-14.
 * Stage words show only below 3 full months of records; at 3 or more no stage word shows (UI-SPEC owner answer 2), so there is
 * no `word.deeper`. Stage words are plain text, never a state colour.
 */
export const stage = {
  word: { first_read: 'First look', full: 'Full check' },
  card: {
    title: 'How results are worked out',
    first_read: 'Results are a first look. They use the figures you typed in, not your records.',
    full: 'Results use your records. Three months of records add extra details.',
    deeper: 'Results use your last {{months}} months of records, with all features active.',
    tickLabel: '1 month: full check',
    endLabel: '3 months: extra details',
    a11y: 'How results are worked out. {{stage}}. {{monthsUsed}} of 3 months.',
    a11yDeeper: 'How results are worked out. {{monthsUsed}} months of records.',
    barA11y: '{{monthsUsed}} of 3 months of records. {{stage}} is active.',
    // 08.1-14 (FOLLOWUPS 21|14): plural by count, so one month reads "1 month".
    announce_one: 'Decide now has {{count}}\u00A0month of records. {{stage}} is active.',
    announce_other: 'Decide now has {{count}}\u00A0months of records. {{stage}} is active.',
    announceDeeper: 'Decide now has {{monthsUsed}} months of records. All features are active.',
  },
  line: {
    first_read: 'First look. Uses the numbers you typed in. One full month of records unlocks the full check.',
    full: 'Full check using {{monthsUsed}} of 3 months. Three months add income changes and what could shift this result.',
    importLink: 'Import statements',
    addLink: 'Add past months',
  },
  import: {
    firstTitle: 'Import your last 3 statements',
    firstSub: 'One month gives a full check today; three add extra details. Supports CSV, OFX, or PDF.',
    moreTitle: 'Add past months',
    moreSub: 'Every month you add unlocks more detail. Supports CSV, OFX, or PDF.',
    a11y: '{{title}}. {{sub}}',
  },
  about: {
    stageRow: {
      first_read: 'Stage: First look. One full month of records gives the full check.',
      full: 'Stage: Full check. Three months of records unlock extra details.',
    },
    heldBack: {
      all: 'These need 3 months of history: income changes, estimated pay, and what could change this result.',
      // Rare mixes, kept per owner answer (planning 2026-11-18).
      answerRange: 'This needs 3 months of history: what could change this result.',
      pay: 'These need 3 months of income history: income changes and pay worked out from your history.',
    },
    howFarTitle: 'How far ahead',
    howFar: 'Results look up to 12 months ahead. We don’t show dates past that.',
  },
  notReady: {
    firstRead: 'Get a first look',
    import: 'Import statements for a full check',
    note: 'A first look uses the numbers you type in. A full check takes one full month of records.',
  },
  empty: {
    title: 'No full month of records yet',
    body: 'Results are a first look until you have one. Import statements or log this month as you go.',
  },
} as const;
