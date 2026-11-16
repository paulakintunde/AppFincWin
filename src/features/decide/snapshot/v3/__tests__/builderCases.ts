// 05.5-12 / 05.5-16: the fixture sources both the parity harness and the changed-answers page run. Test-only.
import { demoSource } from '../../../__tests__/helpers/demoScenario';
import { CAD_RATE, CATEGORIES, USD_RATE, account, debt, goal, household, row, series, settings, sourceOf } from '../../__tests__/helpers/sourceFixtures';
import type { SnapshotSource } from '../../buildSnapshot';
import type { InputsSource } from '../buildInputsParts';
import type { V3SettingsSource } from '../types';
import { v3s } from './v3Fixtures';

export const TODAY = '2026-10-03';
const everyday = (over: Partial<NonNullable<V3SettingsSource>> = {}) => v3s({ income_types: ['salary_or_wages'], hold_months: 2, tight_line: 25000, tax_set_aside_bp: 2500, ...over });

export interface Case { name: string; source: InputsSource; settings: V3SettingsSource | null }

export function cases(): Case[] {
  const demo = demoSource(TODAY);
  const hh = household();
  const eur = household({ rates: [USD_RATE] }, 'EUR');
  const withDebts = (): SnapshotSource => ({
    ...demo,
    debts: [...demo.debts.map((d, i) => (i === 0 ? { ...d, series_id: 'demo-series-salary', due_day: 12 } : d))],
  });
  const card = account({ id: 'card-x', name: 'Card', kind: 'credit' });
  const cardSource: SnapshotSource = {
    ...hh,
    accounts: [...hh.accounts, card],
    balances: { ...hh.balances, 'card-x': -150_000 },
    rows: [...hh.rows, row({ id: 'pend-card', account_id: 'card-x', original_amount: -20_000, status: 'pending', local_date: '2026-10-20' })],
    debts: [debt({ id: 'd-card', kind: 'card', account_id: 'card-x', paid_in_full: false })],
  };
  const noTerms: SnapshotSource = { ...cardSource, region: null };
  const storedTerms: SnapshotSource = { ...cardSource, debts: [debt({ id: 'd-card', kind: 'card', account_id: 'card-x', min_percent: '2', min_interest_added: false, min_floor: 3_000, apr: '19.9' })] };
  const typedOnly: SnapshotSource = sourceOf({
    accounts: [account({ id: 'chk' })],
    balances: { chk: 250_000 },
    settings: settings({ rough_income: 400_000, rough_spending: 300_000 }),
    categories: CATEGORIES,
  });
  const foreignRows: SnapshotSource = {
    ...hh,
    rates: [USD_RATE, CAD_RATE],
    rows: [...hh.rows, row({ id: 'cad-1', local_date: '2026-09-12', original_amount: -5_000, original_currency: 'CAD', home_currency: 'CAD', home_amount: -5_000, orig_per_eur: null })],
    accounts: [...hh.accounts, account({ id: 'cad', currency: 'CAD', kind: 'checking' })],
    balances: { ...hh.balances, cad: 10_000 },
  };
  const withGoal: SnapshotSource = {
    ...hh,
    goals: [goal({ id: 'g-1', target: 120_000, monthly_amount: 10_000, opening_saved: 5_000 }), goal({ id: 'g-net', is_safety_net: true, target: 300_000, opening_saved: 150_000, name: 'Net', account_id: 'sav' })],
    series: [...hh.series, series({ id: 's-save', amount: -20_000, category_id: 'c-sav' }), series({ id: 's-goal', amount: -10_000, goal_id: 'g-1' })],
  };
  const noRateAccount: SnapshotSource = { ...hh, accounts: [...hh.accounts, account({ id: 'jpy', currency: 'JPY' })], balances: { ...hh.balances, jpy: 9_000 } };
  const caps = { 'c-food': 50_000, 'c-house': null };
  const ruleCaps = v3s({ own_lines: [{ id: 'own_cap_1', on: true, spec: { kind: 'category_monthly_cap', categoryId: 'c-food', cap: 45_000 } }, { id: 'own_big', on: true, spec: { kind: 'single_purchase_cap', cap: 90_000 } }] });
  return [
    { name: 'demo, nothing set up', source: demo, settings: null },
    { name: 'demo, settings answered', source: demo, settings: everyday({ unspent_anchor: 120_000, unspent_anchor_at: '2026-10-01', month_marks: { '2026-09': 'out' } }) },
    { name: 'household', source: hh, settings: null },
    { name: 'household in EUR with a rate', source: eur, settings: null },
    { name: 'household with foreign rows', source: foreignRows, settings: null },
    { name: 'household with an account no rate converts', source: noRateAccount, settings: null },
    { name: 'recorded loan with a series and a due day', source: withDebts(), settings: null },
    { name: 'card with market terms and a pending payment', source: cardSource, settings: null },
    { name: 'card with stored terms', source: storedTerms, settings: null },
    { name: 'card with no region terms', source: noTerms, settings: null },
    { name: 'typed estimates only', source: typedOnly, settings: v3s({ rough_saving: 20_000, rough_as_of: '2026-10-01' }) },
    { name: 'goals, a safety net and savings series', source: withGoal, settings: null },
    { name: 'rules-document caps and category caps', source: { ...hh, categoryCaps: caps }, settings: ruleCaps },
    { name: 'category caps only', source: { ...hh, categoryCaps: caps }, settings: null },
    // 05.5-16: with the settings answered the demo gives real answers, so a cap set only on Activity can move one.
    { name: 'demo, settings answered, Activity caps on Dining and Groceries', source: { ...demo, accounts: demo.accounts.map((a) => ({ ...a, use: 'everyday' as const })), categoryCaps: { 'cat-dining': 5_000, 'cat-groceries': 20_000 } }, settings: everyday({ income_types: ['salary'], income_pattern: 'steady', income_pattern_confirmed: true, unspent_anchor: 1_497_097, unspent_anchor_at: '2026-10-03' }) },
  ];
}


export interface Diff { path: string; old: unknown; next: unknown }

const SHOW = (x: unknown): unknown => (typeof x === 'bigint' ? `${x}n` : x);

/** Recursive path-level difference of two input trees. An absent key and an undefined value are the same. */
export function diffInputs(a: unknown, b: unknown, at = ''): Diff[] {
  if (Object.is(a, b)) return [];
  const bothArrays = Array.isArray(a) && Array.isArray(b);
  const bothObjects = typeof a === 'object' && a !== null && typeof b === 'object' && b !== null && !Array.isArray(a) && !Array.isArray(b);
  if (bothArrays) {
    const out: Diff[] = [];
    for (let i = 0; i < Math.max(a.length, b.length); i += 1) out.push(...diffInputs(a[i], b[i], `${at}[${i}]`));
    return out;
  }
  if (bothObjects) {
    const x = a as Record<string, unknown>;
    const y = b as Record<string, unknown>;
    const keys = [...new Set([...Object.keys(x), ...Object.keys(y)])].sort();
    return keys.flatMap((k) => diffInputs(x[k], y[k], at === '' ? k : `${at}.${k}`));
  }
  return [{ path: at, old: SHOW(a), next: SHOW(b) }];
}

