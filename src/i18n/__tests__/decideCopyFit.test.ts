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

  it('D-76 rule U: the table strings carry the no-break space where the unit follows', () => {
    expect(get('decide.quick.overMonths_other')).toBe(`Over {{count}}${NBSP}months`);
    expect(get('decide.quick.overMonths_one')).toBe(`Over 1${NBSP}month`);
    expect(get('decide.fold.investPreview_other')).toContain(`{{count}}${NBSP}months at {{rate}}%${NBSP}a year`);
    expect(get('decide.pay.horizonYears_other')).toBe(`{{count}}${NBSP}years`);
    expect(get('decide.depth.invest.axisMonths')).toBe(`{{count}}${NBSP}mo`);
  });

  // Every Decide string rendered through `Eyebrow` (check/steps/stepUi.tsx) or with textTransform 'uppercase', with the
  // source file that renders it. Counts take the largest value (step 5; 120 months).
  const EYEBROWS: { key: string; source: string; params?: Record<string, string> }[] = [
    { key: 'decide.flow.stepOf', source: 'check/CheckFlowHeader.tsx', params: { n: '5' } },
    { key: 'decide.pay.card.comesTo', source: 'check/steps/step2/MethodPanels.tsx' },
    { key: 'decide.pay.howYouPay.head', source: 'check/steps/step2/PaymentMethods.tsx' },
    { key: 'decide.pay.howYouPay.headInvest', source: 'check/steps/step2/PaymentMethods.tsx' },
    { key: 'decide.pay.price.head', source: 'check/steps/Step2PriceAndPay.tsx' },
    { key: 'decide.pay.price.amount', source: 'check/steps/Step2PriceAndPay.tsx' },
    { key: 'decide.alt.heading', source: 'check/steps/Step4Alternatives.tsx', params: { count: '120' } },
    { key: 'decide.alt.spendTitle', source: 'check/steps/Step4Alternatives.tsx' },
    { key: 'decide.alt.tradeEyebrow', source: 'check/steps/Step4Alternatives.tsx' },
    { key: 'decide.decision.plan', source: 'check/steps/Step5Decision.tsx' },
    { key: 'decide.decision.account', source: 'check/steps/Step5Decision.tsx' },
    { key: 'decide.decision.investInto', source: 'check/steps/Step5Decision.tsx' },
    { key: 'decide.fold.everyLine', source: 'check/sections/WhatBreaksSection.tsx' },
    { key: 'decide.month.eyebrow', source: 'home/YourMonthCard.tsx' },
    { key: 'decide.month.roughEyebrow', source: 'home/YourMonthCard.tsx' },
    { key: 'decide.size.from_spare_this_month', source: 'check/VerdictCard.tsx (size line)' },
    { key: 'decide.size.from_savings', source: 'check/VerdictCard.tsx (size line)' },
    { key: 'decide.size.needs_spreading', source: 'check/VerdictCard.tsx (size line)' },
    { key: 'decide.verdict.key.leftCaption', source: 'ui/FigureStrip.tsx (caption)' },
    { key: 'decide.verdict.key.cushionCaption', source: 'ui/FigureStrip.tsx (caption)' },
    { key: 'decide.verdict.key.monthlyCaption', source: 'ui/FigureStrip.tsx (caption)' },
    { key: 'decide.verdict.key.putInCaption', source: 'ui/FigureStrip.tsx (caption)' },
  ];
  const EYEBROW_CAP = 32;

  it('D-76 rule E: every Decide eyebrow is at most 32 characters', () => {
    expect(EYEBROWS.length).toBeGreaterThan(15);
    const tooLong = EYEBROWS.filter(({ key, params }) => fill(get(key), params ?? {}).toUpperCase().length > EYEBROW_CAP).map(
      (e) => `${e.key} (${e.source})`
    );
    expect(tooLong).toEqual([]);
  });

  // R3 "Plural keys (F6)". decide.pay.monthsShort ("1 mo" / "{{count}} mo") is in the table but no screen renders it,
  // so it is not in the catalogue (reported in the 05-77 summary); the short unit that exists is
  // decide.depth.invest.axisMonths, which rule U covers.
  const PLURAL_KEYS = [
    'decide.quick.overMonths',
    'decide.quick.monthlyCaption',
    'decide.quick.monthlyCaptionZero',
    'decide.quick.monthlyCaptionPaidOff',
    'decide.pay.loanTermNote',
    'decide.pay.summaryLoan',
    'decide.pay.summaryCardMonths',
    'decide.pay.summaryContribution',
    'decide.pay.instalmentRateNote',
    'decide.pay.instalmentRateNoteMonth',
    'decide.pay.projection',
    'decide.verdict.projection',
    'decide.fold.investPreview',
    'decide.pay.horizonYears',
  ];

  it('R3 F6: plural keys exist and caption caps hold at 120', () => {
    for (const key of PLURAL_KEYS) {
      expect(get(`${key}_one`)).toBeTruthy();
      expect(get(`${key}_other`)).toBeTruthy();
    }
    const count = { count: '120' };
    expect(fill(get('decide.quick.overMonths_other'), count).length).toBeLessThanOrEqual(15);
    expect(fill(get('decide.quick.monthlyCaption_other'), count).length).toBeLessThanOrEqual(22);
    expect(fill(get('decide.quick.monthlyCaptionZero_other'), count).length).toBeLessThanOrEqual(43);
    expect(fill(get('decide.quick.monthlyCaptionPaidOff_other'), { ...count, paid: '119' }).length).toBeLessThanOrEqual(46);
    expect(fill(get('decide.fold.investPreview_other'), { ...count, fv: '$1,234,567', rate: '12.5' }).length).toBeLessThanOrEqual(44);
  });

  it('D-76 rule T: copy caps hold by length', () => {
    const amounts = { amount: '$1,234', short: '$1,234', already: '$412', left: '$1,234', pct: '41%', basis: 'average', count: '100', horizon: '60', payment: '$302.08' };
    const titles = leaves.filter((l) => l.path.startsWith('decide.verdict.title'));
    expect(titles.length).toBeGreaterThan(10);
    for (const { path, value } of titles) {
      const cap = path === 'decide.verdict.titleInvBoth' ? 72 : 64;
      expect({ path, ok: fill(value, amounts).replace(/\{\{\w+\}\}/g, 'X').length <= cap }).toEqual({ path, ok: true });
    }
    const reasons = leaves.filter((l) => l.path.startsWith('decide.alt.reason'));
    expect(reasons.length).toBeGreaterThan(3);
    for (const { path, value } of reasons) {
      expect({ path, ok: fill(value, amounts).replace(/\{\{\w+\}\}/g, 'X').length <= 44 }).toEqual({ path, ok: true });
    }
    expect(get('decide.alt.reasonTooLarge')).toHaveLength(33);
    expect(get('decide.depth.invest.tooLarge')).toHaveLength(33);
  });
});
