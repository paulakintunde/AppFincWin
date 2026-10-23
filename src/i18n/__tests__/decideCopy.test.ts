// DCU-09 and the UI-SPEC banned list: FincWin is not a lender and the card path never reads as an offer.
import en from '../locales/en';
import { DRAFT_COPY_KEYS } from '../copyStatus';

interface Leaf {
  path: string;
  value: string;
}

function collectLeaves(node: unknown, prefix = ''): Leaf[] {
  if (typeof node === 'string') return [{ path: prefix, value: node }];
  if (node && typeof node === 'object') {
    return Object.entries(node as Record<string, unknown>).flatMap(([key, value]) =>
      collectLeaves(value, prefix ? `${prefix}.${key}` : key)
    );
  }
  return [];
}

const leaves = collectLeaves(en.decide, 'decide');

// WR-D04 / WR-B09: reassurance about the future ("safe to plan on") is advice in another form; the record states what
// the figures are and what the check does with them.
const REASSURING = [/\bsafe to\b/i, /\bdon[’']t worry\b/i, /\bnothing to worry\b/i, /\bno problem\b/i, /\bgo for it\b/i, /\byou can afford\b/i, /\bworth it\b/i, /\byou[’']re fine\b/i, /\byou[’']ll be fine\b/i, /\bsafely\b/i];
// WR-D04: copy that describes money never opens with an order to spend, save, buy or borrow. Option titles read as
// states ("Saving first, then buying"), not instructions.
const IMPERATIVE_LEAD = /^(Spend|Save|Try|Keep|Buy|Borrow|Skip|Put|Cut|Pay|Invest|Sell|Stop)\b/;
// Controls and field labels name an action the user takes in the app (a button, a dialog choice, a field caption); they
// are not a prescription about money. Each one is listed by key so a new descriptive string cannot slip through.
const ACTION_LABELS = new Set([
  'decide.quick.payWith', // field caption: "Pay with" Cash / Credit
  'decide.quick.error.retry', // button
  'decide.flow.retry', // button
  'decide.rough.save', // button
  'decide.lines.save', // button
  'decide.flow.saveClose', // button
  'decide.flow.commit.wait', // button: "Save the plan" commits the Wait decision the user chose
  'decide.scope.save', // button
  'decide.lineEditor.save', // button
  'decide.depth.changes.save', // button
  'decide.depth.cardMin.save', // button
  'decide.past.removeKeep', // dialog choice: keep the decision record
  'decide.onboarding.skip', // button: skip this onboarding step
  'decide.onboarding.checkTitle', // invites the user to try the check itself, not a purchase
  'decide.delete.keep', // dialog choice: keep the record instead of deleting it
  'decide.verdict.key.putInCaption', // field caption: the key figure "Put in a month" (investing amount)
]);
const BANNED = [/\badvice\b/i, /\badvis/i, /recommend/i, /you should/i, /we suggest/i, /best option/i, /guaranteed/i, /\bapproved\b/i, /pre-approved/i, /\boffer/i, /apply for/i, /\blender\b/i, /loan offer/i, /interest-free/i];

// Demo-scale values (05-18 demo: income $4,400 a month, car loan over 48 months). Four-digit amounts are the widest a
// demo month shows; `already` < `short` by meaning ("already X short. This makes it Y"); 'average' is the longer basis
// word; 100 months against the 60-month maximum credit horizon is the longest past-horizon pair the demo can produce.
const DEMO_VALUES: Record<string, string> = { amount: '$1,234', short: '$1,234', already: '$412', left: '$1,234', pct: '41%', basis: 'average', count: '100', horizon: '60', payment: '$302.08' }; // payment: a demo-scale monthly payment with cents (D-54)
const TITLE_CAP = 64; // UI-SPEC: title at most 3 heading lines at 402 ("about 64 characters")
const REASON_CAP = 44; // UI-SPEC: each suppression reason <= 44 characters, one meta line
const QUICK_NEW_CAP = 64;
// UI-SPEC conflict (05-02 revision): titleInvBoth is 65 characters before its amount, so no amount fits 64.
// The string is locked, so it is capped at 72 here and its three-line fit is checked on device in 05-26.
const TITLE_CAP_EXCEPTIONS: Record<string, number> = { 'decide.verdict.titleInvBoth': 72 };

function interpolate(value: string, overrides: Record<string, string> = {}): string {
  return value.replace(/\{\{(\w+)\}\}/g, (_m, name: string) => overrides[name] ?? DEMO_VALUES[name] ?? 'X');
}

function get(path: string): string {
  const found = leaves.find((l) => l.path === path);
  if (!found) throw new Error(`no decide leaf ${path}`);
  return found.value;
}

describe('decide copy (DCU-09)', () => {
  it('has leaves', () => {
    expect(leaves.length).toBeGreaterThan(300);
  });

  it.each(leaves)('uses no banned word: $path', ({ value }) => {
    for (const re of BANNED) expect(value).not.toMatch(re);
  });

  it.each(leaves)('does not reassure about the future: $path', ({ value }) => {
    for (const re of REASSURING) expect(value).not.toMatch(re);
  });

  it.each(leaves.filter((l) => !ACTION_LABELS.has(l.path)))('does not open with an order about money: $path', ({ value }) => {
    expect(value).not.toMatch(IMPERATIVE_LEAD);
  });

  it('every listed action label exists and still opens with its verb (WR-D04)', () => {
    for (const path of ACTION_LABELS) expect(get(path)).toMatch(IMPERATIVE_LEAD);
  });

  it('the guard catches the wording WR-D04 and WR-B09 replaced', () => {
    for (const old of ['The average is safe to plan on.']) expect(REASSURING.some((re) => re.test(old))).toBe(true);
    for (const old of ['Spend less, keep the rest working', 'Save first, then buy', 'Try on credit', 'Skip it entirely', 'Buy at month 3, then keep the $1 a month', 'Put it on a card']) {
      expect(old).toMatch(IMPERATIVE_LEAD);
    }
  });

  it('uses the word lend only in the not-a-lender footer', () => {
    expect(leaves.filter((l) => /lend/i.test(l.value)).map((l) => l.path)).toEqual(['decide.flow.notLender']);
  });

  it.each(leaves)('uses no straight apostrophe: $path', ({ value }) => {
    expect(value).not.toContain("'");
  });

  it('marks every decide leaf as draft copy', () => {
    const drafts = new Set<string>(DRAFT_COPY_KEYS);
    expect(leaves.filter((l) => !drafts.has(l.path)).map((l) => l.path)).toEqual([]);
  });

  it('keeps notification copy free of placeholders (lock-screen privacy, D-10)', () => {
    for (const key of ['title', 'body', 'coolingTitle', 'coolingBody']) {
      expect(get(`decide.notify.${key}`)).not.toContain('{{');
    }
  });
});

describe('decide copy length caps', () => {
  const titles = leaves.filter((l) => l.path.startsWith('decide.verdict.title'));
  const reasons = leaves.filter((l) => l.path.startsWith('decide.alt.reason'));

  it('has no exception beyond titleInvBoth', () => {
    expect(Object.keys(TITLE_CAP_EXCEPTIONS)).toEqual(['decide.verdict.titleInvBoth']);
  });

  it.each(titles)('verdict title fits three lines: $path', ({ path, value }) => {
    expect(interpolate(value).length).toBeLessThanOrEqual(TITLE_CAP_EXCEPTIONS[path] ?? TITLE_CAP);
  });

  it.each(reasons)('alternatives reason fits one line: $path', ({ value }) => {
    expect(interpolate(value).length).toBeLessThanOrEqual(REASON_CAP);
  });

  it.each(leaves.filter((l) => l.path.startsWith('decide.verdict.missing.')))('missing title fits: $path', ({ value }) => {
    expect(interpolate(value).length).toBeLessThanOrEqual(TITLE_CAP);
  });

  it('missing-rate title fits with two currencies', () => {
    expect(interpolate(get('decide.missingRate.title'), { currency: 'EUR, GBP' }).length).toBeLessThanOrEqual(TITLE_CAP);
  });

  it.each(['cashDip', 'cashDipHard', 'creditCashDip', 'creditCashDipHard'])('quick line %s fits', (key) => {
    expect(interpolate(get(`decide.quick.line.${key}`)).length).toBeLessThanOrEqual(QUICK_NEW_CAP);
  });
});

describe('decide depth copy (05-31, DCU-09)', () => {
  const depth = leaves.filter((l) => l.path.startsWith('decide.depth.'));
  const INVESTING_BANNED = ['invest now', 'start investing', 'best rate', 'you will earn', 'you should invest'];

  it('has depth leaves', () => {
    expect(depth.length).toBeGreaterThan(150);
  });

  it.each(depth)('depth leaf passes the banned list: $path', ({ value }) => {
    for (const re of BANNED) expect(value).not.toMatch(re);
  });

  it('never promises or pushes investing', () => {
    for (const l of leaves) {
      for (const phrase of INVESTING_BANNED) expect(l.value.toLowerCase()).not.toContain(phrase);
    }
  });

  it('uses forecast only as "not a forecast"', () => {
    const withForecast = leaves.filter((l) => /forecast/i.test(l.value));
    expect(withForecast.length).toBeGreaterThan(0);
    for (const l of withForecast) expect(l.value.toLowerCase()).toContain('not a forecast');
  });

  it('marks every depth leaf and the record one-off keys as draft copy', () => {
    const drafts = new Set<string>(DRAFT_COPY_KEYS);
    const required = [
      ...depth.map((l) => l.path),
      'record.sheet.toggle.oneOff',
      'record.sheet.note.oneOff',
      'activity.detail.oneOff',
      'activity.detail.oneOffValue',
    ];
    expect(required.filter((p) => !drafts.has(p))).toEqual([]);
  });

  it('keeps the combined-check line within the verdict body cap at nine checks', () => {
    expect(interpolate(get('decide.depth.combined.differs_other'), { count: '9' }).length).toBeLessThanOrEqual(64);
  });

  it('starts every cushion reason with because', () => {
    const because = depth.filter((l) => l.path.startsWith('decide.depth.cushion.because.'));
    expect(because.length).toBe(4);
    for (const l of because) expect(l.value.startsWith('because')).toBe(true);
  });
});
