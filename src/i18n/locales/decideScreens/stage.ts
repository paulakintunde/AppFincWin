/**
 * 08.1-20: Decide stages by data. Owner plan 08.1-20 (keys used by 08.1-20 and 08.1-21). Draft, signed in 08.1-14.
 * Stage words show only below 3 full months of records; at 3 or more no stage word shows (UI-SPEC owner answer 2), so there is
 * no `word.deeper`. Stage words are plain text, never a state colour.
 */
export const stage = {
  word: { first_read: 'First read', full: 'Full answer' },
  card: {
    title: 'What answers rest on',
    first_read: 'Answers are a first read. They use the figures you typed, not your records.',
    full: 'Answers use your records. Three months of records add the deeper parts.',
    deeper: 'Answers use your last {{months}} months of records, with every part on.',
    tickLabel: '1 month: full answer',
    endLabel: '3 months: deeper parts',
    a11y: 'What answers rest on. {{stage}}. {{monthsUsed}} of 3 months.',
    a11yDeeper: 'What answers rest on. {{monthsUsed}} months of records.',
    barA11y: '{{monthsUsed}} of 3 months of records. {{stage}} is on.',
    announce: 'Decide now has {{monthsUsed}} months of records. {{stage}} is on.',
    announceDeeper: 'Decide now has {{monthsUsed}} months of records. Every part is on.',
  },
  line: {
    first_read: 'A first read. It uses the figures you typed. One full month of records unlocks the full answer.',
    full: 'A full answer from {{monthsUsed}} of 3 months. Three months add pay swings and what could move this answer.',
    importLink: 'Import statements',
    addLink: 'Add earlier months',
  },
  import: {
    firstTitle: 'Import your last 3 statements',
    firstSub: 'One month gives a full answer today. Three add the deeper parts. CSV, OFX or PDF.',
    moreTitle: 'Add earlier months',
    moreSub: 'Each month you add moves answers toward the deeper parts. CSV, OFX or PDF.',
    a11y: '{{title}}. {{sub}}',
  },
  about: {
    stageRow: {
      first_read: 'Stage: First read. One full month of records gives the full answer.',
      full: 'Stage: Full answer. Three months of records add the deeper parts.',
    },
    heldBack: {
      all: 'These need three months of records: pay swings, pay worked out from your history, and what could move this answer.',
      // Rare mixes, kept per owner answer (planning 2026-11-18).
      answerRange: 'This needs three months of records: what could move this answer.',
      pay: 'These need three months of pay in your records: pay swings and pay worked out from your history.',
    },
    howFarTitle: 'How far ahead',
    howFar: 'Answers look up to 12 months ahead. Dates further out are not given.',
  },
  notReady: {
    firstRead: 'Get a first read',
    import: 'Import statements for a full answer',
    note: 'A first read uses the figures you type. A full answer needs one full month of records.',
  },
  empty: {
    title: 'No full month of records yet',
    body: 'Answers are a first read until there is one. Import statements or add this month as you go.',
  },
} as const;
