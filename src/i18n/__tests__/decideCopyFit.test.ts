// UI-SPEC R6 (text fit) copy rules held by the catalogue itself: rule U (units), rule E (eyebrows), rule T (length
// caps), and the R3 "Plural keys (F6)" table. The leaf helper is copied from decideCopy.test.ts on purpose: a test file
// is not imported by another.
import en from '../locales/en';

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
const NBSP = ' ';

function get(path: string): string {
  const found = leaves.find((l) => l.path === path);
  if (!found) throw new Error(`no decide leaf ${path}`);
  return found.value;
}

function fill(value: string, params: Record<string, string>): string {
  return value.replace(/\{\{(\w+)\}\}/g, (_m, name: string) => params[name] ?? `{{${name}}}`);
}

describe('decide copy fit (R6)', () => {
  it('D-76 rule U: counts and units are joined by a no-break space', () => {
    // {{count}} + month(s) / mo / year(s), a literal 1 + month / year (the _one forms), and {{rate}}% + a year
    const plainCount = /(\{\{count\}\}|\b1) (months?|mo|years?)\b/;
    const plainRate = /\{\{rate\}\}% a year/;
    const offenders = leaves.filter((l) => plainCount.test(l.value) || plainRate.test(l.value)).map((l) => l.path);
    expect(offenders).toEqual([]);
  });

  it('D-76 rule U: the surviving table string carries the no-break space where the unit follows', () => {
    expect(en.sync.waiting_other).toContain(`{{count}}${NBSP}changes`);
  });

  // 06.1-37: the eyebrow list shrank to the strings the new screens still read through the catalogue.
  const EYEBROWS: { key: string; source: string; params?: Record<string, string> }[] = [
    { key: 'decide.size.from_spare_this_month', source: 'size line' },
    { key: 'decide.size.from_savings', source: 'size line' },
    { key: 'decide.size.needs_spreading', source: 'size line' },
  ];
  const EYEBROW_CAP = 32;

  it('D-76 rule E: every surviving Decide eyebrow is at most 32 characters', () => {
    const tooLong = EYEBROWS.filter(({ key, params }) => fill(get(key), params ?? {}).toUpperCase().length > EYEBROW_CAP).map((e) => `${e.key} (${e.source})`);
    expect(tooLong).toEqual([]);
  });

  it('D-76 rule T: the warning titles fit the 44-character fold preview', () => {
    for (const key of ['monthTitle', 'cashTitle', 'cashDipTitle', 'dsrTitle', 'oweTitle', 'invTitleInvesting', 'housingTitle']) {
      expect({ key, ok: get(`decide.warn.${key}`).length <= 44 }).toEqual({ key, ok: true });
    }
  });
});
