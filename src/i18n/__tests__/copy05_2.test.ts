// 05.2 (plan 20): the load-bearing 05.2 strings read exactly as 05.2-UI-SPEC.md words them, and every namespace the
// wave-4 UI plans read from exists and is non-empty. Interpolation uses the file's {{name}} syntax.
import en from '../locales/en';

function get(path: string): string {
  let node: unknown = en;
  for (const part of path.split('.')) {
    node = (node as Record<string, unknown> | undefined)?.[part];
  }
  if (typeof node !== 'string') throw new Error(`no string at ${path}`);
  return node;
}

function leaves(node: unknown, prefix = ''): { path: string; value: string }[] {
  if (typeof node === 'string') return [{ path: prefix, value: node }];
  if (node && typeof node === 'object') {
    return Object.entries(node as Record<string, unknown>).flatMap(([k, v]) => leaves(v, prefix ? `${prefix}.${k}` : k));
  }
  return [];
}

describe('05.2 copy, verbatim from UI-SPEC', () => {
  const verbatim: Record<string, string> = {
    'income.paid.title': 'How are you paid?',
    'income.season.title': 'Does your income change by season?',
    'income.method.title': 'Your income changes. How should Decide count it?',
    'decide.setup.welcome.title': 'Set up Decide',
    'decide.setup.regular.unmarkedLine': 'Payments you don’t mark aren’t counted as regular. You can mark them later.',
    'decide.setup.saving.overLine': '{{amount}} more than your regular saving.',
    'decide.setup.saving.overExplain': 'If you leave it, Decide counts the larger of the two as set aside each month.',
    'decide.setup.saving.raise': 'Raise my regular saving to {{amount}}',
    'decide.setup.saving.lower': 'Lower a bucket',
    'decide.setup.summary.footer':
      'Worked out from your own records and what you told us. FincWin records and plans. It does not lend money, arrange credit or hold your funds.',
    'decide.settings.resetBody': 'This clears your setup answers only. Your transactions, regular payments, loans and envelopes stay as they are.',
    'decide.setupPage.readoutEyebrow': 'WHAT DECIDE RECEIVES',
    'activity.incomeCard.body': 'Set it up once so Activity and Decide count your income the right way.',
    'activity.incomeTag.countLine_other': 'This also tags {{count}} earlier payments from {{payer}}.',
    'activity.refund.footer': 'Your balances and records stay exactly as logged. Only Decide’s view changes.',
  };

  it.each(Object.entries(verbatim))('%s', (path, text) => {
    expect(get(path)).toBe(text);
  });

  it('the Summary not-a-lender footer appears once (decide.flow.notLender carries the same closing sentence)', () => {
    const hits = leaves(en).filter((l) => l.value.startsWith('Worked out from your own records') && l.value.includes('It does not lend money, arrange credit or hold your funds.'));
    expect(hits.map((l) => l.path)).toEqual(['decide.setup.summary.footer']);
  });

  it('the singular earlier-payment line exists for the one-payment case', () => {
    expect(get('activity.incomeTag.countLine_one')).toBe('This also tags {{count}} earlier payment from {{payer}}.');
  });
});

describe('05.2 namespace completeness', () => {
  const namespaces: [string, unknown][] = [
    ['income.paid', en.income.paid],
    ['income.pay', en.income.pay],
    ['income.season', en.income.season],
    ['income.method', en.income.method],
    ['income.other', en.income.other],
    ['decide.setup.shell', en.decide.setup.shell],
    ['decide.setup.welcome', en.decide.setup.welcome],
    ['decide.setup.regular', en.decide.setup.regular],
    ['decide.setup.loans', en.decide.setup.loans],
    ['decide.setup.saving', en.decide.setup.saving],
    ['decide.setup.everyday', en.decide.setup.everyday],
    ['decide.setup.unusual', en.decide.setup.unusual],
    ['decide.setup.accountUse', en.decide.setup.accountUse],
    ['decide.setup.emergency', en.decide.setup.emergency],
    ['decide.setup.envelopes', en.decide.setup.envelopes],
    ['decide.setup.unspent', en.decide.setup.unspent],
    ['decide.setup.share', en.decide.setup.share],
    ['decide.setup.detail', en.decide.setup.detail],
    ['decide.setup.reminders', en.decide.setup.reminders],
    ['decide.setup.summary', en.decide.setup.summary],
    ['decide.accountUse', en.decide.accountUse],
    ['decide.unspentSheet', en.decide.unspentSheet],
    ['decide.emergencySheet', en.decide.emergencySheet],
    ['decide.settings', en.decide.settings],
    ['decide.setupPage', en.decide.setupPage],
    ['activity.incomeCard', en.activity.incomeCard],
    ['activity.incomeTag', en.activity.incomeTag],
    ['activity.refund', en.activity.refund],
  ];

  it.each(namespaces)('%s has keys and no empty string', (_name, node) => {
    const found = leaves(node);
    expect(found.length).toBeGreaterThan(0);
    expect(found.filter((l) => l.value.trim() === '').map((l) => l.path)).toEqual([]);
  });

  it('the settings page has all 17 rows with a label and an effect line', () => {
    const rows = Object.values(en.decide.settings.row);
    expect(rows).toHaveLength(17);
    for (const row of rows) {
      expect(row.label.length).toBeGreaterThan(0);
      expect(row.effect.length).toBeGreaterThan(0);
    }
  });

  it('the setup page has the 11 readout labels', () => {
    const labels = Object.keys(en.decide.setupPage).filter((k) => k.startsWith('label'));
    expect(labels).toHaveLength(11);
  });

  it('the five section names exist', () => {
    const s = en.decide.setup.shell;
    expect([s.sectionIncome, s.sectionRegular, s.sectionSpending, s.sectionMoney, s.sectionAnswers]).toEqual([
      'Income',
      'Regular payments',
      'Spending',
      'Your money now',
      'Answers',
    ]);
  });
});

describe('05.2-38 gap-plan copy, undo labels and reverse picker', () => {
  const BANNED = [/\badvice\b/i, /\badvis/i, /recommend/i, /you should/i, /we suggest/i, /\bsafe\b/i, /\bapprove/i, /\breject/i, /\bdecline/i];
  const scoped = leaves(en).filter((l) =>
    /^(decide\.setup\.debtSheet|record\.seriesStatus|decide\.settings\.changed)\./.test(l.path) ||
    /^activity\.refund\.(pickerTitleReverse|pickerSublineReverse|searchPayments|emptyTitleReverse|rowSub|rowSubNoCategory|refundRowValue|refundRowA11y)$/.test(l.path) ||
    l.path === 'activity.incomeTag.detailNotSet' ||
    /^undo\.label(Unnamed)?\.(debtAdded|debtEdited|debtPaidOff|seriesStopped|seriesPaused|seriesResumed)$/.test(l.path),
  );

  it('covers every new key', () => {
    expect(scoped.length).toBe(22 + 19 + 11 + 9 + 12);
  });

  it.each(scoped)('passes the banned-word check: $path', ({ value }) => {
    for (const re of BANNED) expect(value).not.toMatch(re);
  });

  it('the six new undo labels have named and unnamed wording and DB-safe keys', () => {
    const label = en.undo.label as Record<string, string>;
    const unnamed = en.undo.labelUnnamed as Record<string, string>;
    for (const key of ['debtAdded', 'debtEdited', 'debtPaidOff', 'seriesStopped', 'seriesPaused', 'seriesResumed']) {
      expect(key).toMatch(/^[a-zA-Z]{1,40}$/);
      expect(label[key]).toContain('{{name}}');
      expect(unnamed[key]).toBeTruthy();
      expect(unnamed[key]).not.toContain('{{name}}');
    }
  });
});
