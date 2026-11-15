import {
  EMPTY_RULES,
  MAX_OWN_RULES,
  canAddRule,
  kindTaken,
  newRuleId,
  ownLinesOf,
  readRulesDoc,
  removeRule,
  tightLineOf,
  upsertRule,
  withRulesDoc,
  type RulesDoc,
  type StoredRule,
} from '../rulesDoc';

const rule = (over: Partial<StoredRule> = {}): StoredRule => ({ id: 'own_keep', kind: 'keep', on: true, value: 5000, categoryId: null, ...over });
const docOf = (...rules: StoredRule[]): RulesDoc => ({ v: 1, rules });
const wrap = (rules: unknown) => ({ rules: { v: 1, rules } });

describe('readRulesDoc', () => {
  it.each([[null], [undefined], ['x'], [[]], [{}], [{ rules: [] }], [{ rules: { rules: 'no' } }]])('returns the empty document for %p', (input) => {
    expect(readRulesDoc(input)).toBe(EMPTY_RULES);
  });

  it('reads valid rules and defaults a missing on flag to off', () => {
    const doc = readRulesDoc(wrap([{ id: 'a', kind: 'largest', value: 100 }, { id: 'b', kind: 'category_cap', value: 7, categoryId: 'c1', on: true }]));
    expect(doc.rules).toEqual([
      { id: 'a', kind: 'largest', on: false, value: 100, categoryId: null },
      { id: 'b', kind: 'category_cap', on: true, value: 7, categoryId: 'c1' },
    ]);
  });

  it('drops invalid entries, duplicates and entries past the cap', () => {
    const bad = [
      null, 'x', [], { id: '', kind: 'keep', value: 1 }, { id: 3, kind: 'keep', value: 1 }, { id: 'k', kind: 'nope', value: 1 },
      { id: 'n', kind: 'keep', value: '1' }, { id: 'f', kind: 'keep', value: 1.5 }, { id: 'neg', kind: 'keep', value: -1 },
      { id: 'big', kind: 'category_share', value: 101, categoryId: 'c' }, { id: 'nocat', kind: 'category_cap', value: 1 },
      { id: 'emptycat', kind: 'category_share', value: 1, categoryId: '' },
    ];
    const good = Array.from({ length: MAX_OWN_RULES + 2 }, (_, i) => ({ id: `r${i}`, kind: 'keep', value: i }));
    const doc = readRulesDoc(wrap([...bad, ...good, { id: 'r0', kind: 'keep', value: 9 }]));
    expect(doc.rules.map((r) => r.id)).toEqual(['r0', 'r1', 'r2', 'r3', 'r4']);
    expect(doc.rules[0]?.value).toBe(0);
  });
});

describe('document edits', () => {
  it('withRulesDoc keeps everything else and tolerates a non-record', () => {
    expect(withRulesDoc({ a: 1, rules: 'old' }, EMPTY_RULES)).toEqual({ a: 1, rules: EMPTY_RULES });
    expect(withRulesDoc(null, EMPTY_RULES)).toEqual({ rules: EMPTY_RULES });
  });

  it('upsertRule replaces by id, appends a new one and refuses past the cap', () => {
    const base = docOf(rule());
    expect(upsertRule(base, rule({ value: 9 })).rules).toEqual([rule({ value: 9 })]);
    expect(upsertRule(base, rule({ id: 'own_largest', kind: 'largest' })).rules).toHaveLength(2);
    const full = docOf(...Array.from({ length: MAX_OWN_RULES }, (_, i) => rule({ id: `r${i}` })));
    expect(upsertRule(full, rule({ id: 'extra' }))).toBe(full);
    expect(upsertRule(full, rule({ id: 'r1', value: 1 })).rules[1]?.value).toBe(1);
  });

  it('removeRule drops by id', () => {
    expect(removeRule(docOf(rule(), rule({ id: 'b' })), 'b').rules.map((r) => r.id)).toEqual(['own_keep']);
  });

  it('canAddRule stops at the cap', () => {
    expect(canAddRule(EMPTY_RULES)).toBe(true);
    expect(canAddRule(docOf(...Array.from({ length: MAX_OWN_RULES }, (_, i) => rule({ id: `r${i}` }))))).toBe(false);
  });

  it('kindTaken is true only for a present singleton kind', () => {
    expect(kindTaken(docOf(rule()), 'keep')).toBe(true);
    expect(kindTaken(docOf(rule()), 'largest')).toBe(false);
    expect(kindTaken(docOf(rule({ id: 'c', kind: 'category_cap', categoryId: 'x' })), 'category_cap')).toBe(false);
  });

  it('newRuleId gives singletons a fixed id and numbers category rules past taken ids', () => {
    expect(newRuleId('keep', EMPTY_RULES)).toBe('own_keep');
    expect(newRuleId('largest', EMPTY_RULES)).toBe('own_largest');
    expect(newRuleId('category_cap', EMPTY_RULES)).toBe('own_category_cap_1');
    expect(newRuleId('category_cap', docOf(rule({ id: 'own_category_cap_2', kind: 'category_cap', categoryId: 'x' })))).toBe('own_category_cap_3');
  });
});

describe('engine views', () => {
  it('tightLineOf reads the keep rule only when on', () => {
    expect(tightLineOf(EMPTY_RULES)).toBeNull();
    expect(tightLineOf(docOf(rule({ on: false })))).toBeNull();
    expect(tightLineOf(docOf(rule()))).toBe(5000);
  });

  it('ownLinesOf maps each non-keep kind to the engine shape', () => {
    const doc = docOf(
      rule(),
      rule({ id: 'own_largest', kind: 'largest', value: 100, on: false }),
      rule({ id: 'cap', kind: 'category_cap', value: 200, categoryId: 'c1' }),
      rule({ id: 'share', kind: 'category_share', value: 15, categoryId: 'c2' }),
    );
    expect(ownLinesOf(doc)).toEqual([
      { id: 'own_largest', on: false, spec: { kind: 'single_purchase_cap', cap: 100 } },
      { id: 'cap', on: true, spec: { kind: 'category_monthly_cap', categoryId: 'c1', cap: 200 } },
      { id: 'share', on: true, spec: { kind: 'category_income_share', categoryId: 'c2', pct: '15' } },
    ]);
  });
});
