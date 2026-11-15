// UX-19 (05.4-37): every Decide v3 sentence has at most 3 numbers and at most 25 words. The D-64 legal keys (legal.decide*) follow
// the same rule. Fails closed: every {{placeholder}} counts as a number unless it is named below with its reason.
import en from '../locales/en';

interface Leaf {
  path: string;
  value: string;
}

function collect(node: unknown, prefix: string): Leaf[] {
  if (typeof node === 'string') return [{ path: prefix, value: node }];
  if (node && typeof node === 'object') return Object.entries(node as Record<string, unknown>).flatMap(([k, v]) => collect(v, `${prefix}.${k}`));
  return [];
}

const MAX_NUMBERS = 3;
const MAX_WORDS = 25;

/** Placeholders that never render a number. Each one is a name, a date or a label. */
const NOT_A_NUMBER: Readonly<Record<string, string>> = {
  account: 'an account name',
  month: 'a month name',
  monthName: 'a month name',
  lowMonth: 'a month name',
  readyMonth: 'a month name',
  sameMonth: 'a month name',
  lastYear: 'a month name from last year',
  from: 'a month name (lean_months_judged)',
  to: 'a month name (lean_months_judged)',
  leanFrom: 'a month name',
  leanTo: 'a month name',
  date: 'a date',
  dueDate: 'a date',
  until: 'a date',
  readyBy: 'a date or a month',
  category: 'a category name',
  figure: 'the name of a missing figure (D-79)',
  currency: 'a currency code',
  bill: 'a bill name',
  debt: 'a debt name',
  envelope: 'an envelope name',
  name: 'a money-help organisation name (free_help, 05.4-38 D-122), or a line or item name on a Decide screen',
  // 06.1-05 (D-18): decide.screens.* placeholders that are names, labels or dates
  item: 'the name of the item being checked',
  kind: 'a kind of purchase (Car, Tech)',
  next: 'the name of the next setup item',
  stepName: 'a stepper step name',
  state: 'a verdict word (Fits, Not yet)',
  method: 'a way to pay (Cash, Installments)',
  change: 'the name of a change the user reported',
  answer: 'a short verdict phrase built by the screen',
  label: 'a waterfall row label',
};

function sentences(value: string): string[] {
  return value
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function numbersIn(sentence: string): number {
  // A range like "3 to 6" is one figure (the owner's months line, D-35).
  const ranged = sentence.replace(/\d+\s+to\s+\d+/g, 'N');
  const placeholders = [...ranged.matchAll(/\{\{(\w+)\}\}/g)].filter((m) => !((m[1] as string) in NOT_A_NUMBER)).length;
  const digits = (ranged.replace(/\{\{\w+\}\}/g, ' ').match(/\d[\d,.]*/g) ?? []).length + (ranged.match(/\bN\b/g) ?? []).length;
  return placeholders + digits;
}

function wordsIn(sentence: string): number {
  return sentence.split(/\s+/).filter((w) => /\w/.test(w)).length;
}

const legal = collect(en.legal, 'legal').filter((l) => l.path.startsWith('legal.decide'));
const v3 = collect(en.decide.v3, 'decide.v3');
// 06.1-05 (D-18): the new Decide screen strings follow the same rule.
const screens = collect(en.decide.screens, 'decide.screens');
const all = [...v3, ...screens, ...legal];

describe('UX-19 Decide v3 sentence rule', () => {
  it('has leaves', () => {
    expect(v3.length).toBeGreaterThan(200);
    expect(screens.length).toBeGreaterThan(500);
  });

  it(`every sentence has at most ${MAX_NUMBERS} numbers and ${MAX_WORDS} words`, () => {
    const bad: string[] = [];
    for (const l of all) {
      for (const s of sentences(l.value)) {
        const n = numbersIn(s);
        const w = wordsIn(s);
        if (n > MAX_NUMBERS || w > MAX_WORDS) bad.push(`${l.path} (numbers ${n}, words ${w}): ${s}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('counts as written', () => {
    expect(numbersIn('Your {{account}} account would go {{below}} below {{zero}} for about {{days}} days.')).toBe(3);
    expect(numbersIn('1 month is a start; 3 to 6 months is common.')).toBe(2);
    expect(numbersIn('At {{rate}}%, the next 90 days below {{zero}} cost about {{cost}}.')).toBe(4);
    expect(numbersIn('After your pay on {{date}}, {{account}} would still be {{below}}.')).toBe(1);
    expect(wordsIn('This is close to your limit.')).toBe(6);
    expect(sentences('One. Two? Three!')).toEqual(['One.', 'Two?', 'Three!']);
  });

  it('every non-number placeholder is used somewhere', () => {
    const used = new Set(all.flatMap((l) => [...l.value.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1] as string)));
    expect(Object.keys(NOT_A_NUMBER).filter((k) => !used.has(k))).toEqual([]);
  });
});
