import en from '@/i18n/locales/en';
import { FACT_VALUE_KEYS, NOTICE_VALUE_KEYS } from '@/engine/decide/v3';
import type { Fact, FactCode, Notice, NoticeCode } from '@/engine/decide/v3';
import { OVER_RATE_TEXT, factCopy, noticeCopy } from '../copyPick';

jest.setTimeout(60000);

const n = (code: NoticeCode, values: Notice['values']): Notice => ({ code, values });
const f = (code: FactCode, values: Fact['values']): Fact => ({ code, values });

function resolves(key: string): boolean {
  let cur: unknown = en;
  for (const part of key.split('.')) {
    if (typeof cur !== 'object' || cur === null || !(part in cur)) return false;
    cur = (cur as Record<string, unknown>)[part];
  }
  return typeof cur === 'string';
}

describe('copyPick', () => {
  it('D-11: a rate of 9999 reads the over key with 999', () => {
    expect(OVER_RATE_TEXT).toBe('999');
    expect(factCopy(f('implied_rate', { rate: '9999' }))).toEqual({ key: 'decide.v3.fact.implied_rate_over', params: { rate: '999' } });
    expect(factCopy(f('implied_rate', { rate: 'above_max' }))).toEqual({ key: 'decide.v3.fact.implied_rate_over', params: { rate: '999' } });
    expect(factCopy(f('implied_rate', { rate: '22.9' }))).toEqual({ key: 'decide.v3.fact.implied_rate', params: { rate: '22.9' } });
  });

  it('D-46: a count of 1 reads the _one key', () => {
    expect(noticeCopy(n('envelope_location_assumed', { count: 1 })).key).toBe('decide.v3.notice.envelope_location_assumed_one');
    expect(noticeCopy(n('envelope_location_assumed', { count: 3 })).key).toBe('decide.v3.notice.envelope_location_assumed');
    expect(noticeCopy(n('account_use_unknown', { accountId: 'a1', count: 1 }))).toEqual({
      key: 'decide.v3.notice.account_use_unknown_one',
      params: { accountId: 'a1', count: 1 },
    });
    expect(noticeCopy(n('account_use_unknown', { accountId: 'a1', count: 2 })).key).toBe('decide.v3.notice.account_use_unknown');
    expect(noticeCopy(n('unsaved_changes', { count: 1 })).key).toBe('decide.v3.notice.unsaved_changes_one');
    expect(noticeCopy(n('unsaved_changes', { count: 4 })).key).toBe('decide.v3.notice.unsaved_changes');
  });

  it('D-48: one lean month and overspent lean months read _one and _over with the absolute amount', () => {
    const base = { payment: 5000, periods: 6, monthly: 5000, months: 6 };
    const may = noticeCopy(n('income_volatile', { ...base, leanFrom: '2026-05', leanTo: '2026-05', leanLeft: -87000 }));
    expect(may.key).toBe('decide.v3.notice.income_volatile_one_over');
    expect(may.params.leanLeft).toBe(87000);
    expect(noticeCopy(n('income_volatile', { ...base, leanFrom: '2026-05', leanTo: '2026-07', leanLeft: 12000 })).key).toBe('decide.v3.notice.income_volatile');
    expect(noticeCopy(n('income_volatile', { ...base, leanFrom: '2026-05', leanTo: '2026-05', leanLeft: 12000 })).key).toBe('decide.v3.notice.income_volatile_one');
    const over = noticeCopy(n('income_volatile', { ...base, leanFrom: '2026-05', leanTo: '2026-07', leanLeft: -300 }));
    expect(over).toMatchObject({ key: 'decide.v3.notice.income_volatile_over', params: { leanLeft: 300 } });

    expect(factCopy(f('lean_months_judged', { from: '2026-05', to: '2026-05', leanLeft: -87000 }))).toEqual({
      key: 'decide.v3.fact.lean_months_judged_one_over',
      params: { from: '2026-05', to: '2026-05', leanLeft: 87000 },
    });
    expect(factCopy(f('lean_months_judged', { from: '2026-05', to: '2026-07', leanLeft: 100 })).key).toBe('decide.v3.fact.lean_months_judged');
    expect(factCopy(f('lean_months_judged', { from: '2026-05', to: '2026-07', leanLeft: -100 })).key).toBe('decide.v3.fact.lean_months_judged_over');
    expect(factCopy(f('lean_months_judged', { from: '2026-05', to: '2026-05', leanLeft: 100 })).key).toBe('decide.v3.fact.lean_months_judged_one');

    const bridge = factCopy(f('lean_bridge', { monthly: 9000, leanLeft: -5000, shortfall: -14000, months: 3, until: '2026-08', bridge: 42000, after: 1000 }));
    expect(bridge.key).toBe('decide.v3.fact.lean_bridge_over');
    expect(bridge.params).toMatchObject({ leanLeft: 5000, shortfall: 14000 });
    expect(factCopy(f('lean_bridge', { monthly: 9000, leanLeft: 4000, shortfall: 5000, months: 3, until: '2026-08', bridge: 1, after: 1 })).key).toBe('decide.v3.fact.lean_bridge');
  });

  it('picks the UI variants', () => {
    for (const source of ['confirmed', 'last_year', 'low'] as const) {
      expect(noticeCopy(n('income_from_expected', { month: '2026-10', amount: 1, source, sameMonth: null })).key).toBe(`decide.v3.notice.income_from_expected_${source}`);
    }
    expect(noticeCopy(n('income_from_expected', { month: '2026-10', amount: 1, source: 'other' })).key).toBe('decide.v3.notice.income_from_expected');
    expect(noticeCopy(n('month_heading_short', { month: '2026-10', short: 1, categoryId: 'c1', largest: 2 }))).toMatchObject({
      key: 'decide.v3.notice.month_heading_short_category',
      params: { categoryId: 'c1' },
    });
    expect(noticeCopy(n('month_heading_short', { month: '2026-10', short: 1 })).key).toBe('decide.v3.notice.month_heading_short');
    expect(noticeCopy(n('month_heading_short', { month: '2026-10', short: 1, categoryId: null })).key).toBe('decide.v3.notice.month_heading_short');
    for (const unit of ['percent', 'money', 'tenths'] as const) {
      const c = factCopy(f('line_crossed', { lineId: 'l', kind: 'k', unit, value: 1, limit: 2 }));
      expect(c).toEqual({ key: `decide.v3.fact.line_crossed_${unit}`, params: { value: 1, limit: 2 } });
    }
    expect(factCopy(f('line_crossed', { lineId: 'l', kind: 'k', unit: 'x', value: 1, limit: 2 })).key).toBe('decide.v3.fact.line_crossed');
    expect(factCopy(f('emergency_used', { used: 5, months: 4 })).key).toBe('decide.v3.fact.emergency_used_rebuild');
    expect(factCopy(f('emergency_used', { used: 5 })).key).toBe('decide.v3.fact.emergency_used');
    expect(factCopy(f('emergency_used', { used: 5, months: null })).key).toBe('decide.v3.fact.emergency_used');
    expect(factCopy(f('month_left_after', { month: '2026-10', left: 5 })).key).toBe('decide.v3.fact.month_left_after');
  });

  it('contract: every returned key resolves and every param is a declared value key', () => {
    const fill = (keys: readonly string[]): Record<string, string | number> => Object.fromEntries(keys.map((k) => [k, k === 'rate' ? '9999' : k.endsWith('Id') ? 'id1' : 1]));
    const only = (keys: readonly string[], extra: Record<string, string | number>) => ({ ...fill(keys), ...Object.fromEntries(Object.entries(extra).filter(([k]) => keys.includes(k))) });
    for (const code of Object.keys(FACT_VALUE_KEYS) as FactCode[]) {
      const keys = FACT_VALUE_KEYS[code];
      for (const values of [fill(keys), only(keys, { leanLeft: -5, unit: 'money', months: 2 })]) {
        const out = factCopy(f(code, values));
        expect(resolves(out.key)).toBe(true);
        for (const p of Object.keys(out.params)) expect(keys).toContain(p);
      }
    }
    for (const code of Object.keys(NOTICE_VALUE_KEYS) as NoticeCode[]) {
      const keys = NOTICE_VALUE_KEYS[code];
      for (const values of [fill(keys), only(keys, { count: 1, leanLeft: -5, source: 'low' })]) {
        const out = noticeCopy(n(code, values));
        expect(resolves(out.key)).toBe(true);
        for (const p of Object.keys(out.params)) expect(keys).toContain(p);
      }
    }
  });
});
