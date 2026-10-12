import {
  RULE_KEYWORD_MAX,
  hasRuleFor,
  normaliseRuleKeyword,
  resolveRules,
  sharedTargetFor,
  type MemberCategory,
  type StoredRule,
} from '../rules';

const cat = (o: Partial<MemberCategory> & { id: string }): MemberCategory => ({
  builtinKey: null,
  displayName: o.id,
  active: true,
  system: false,
  ...o,
});

describe('normaliseRuleKeyword', () => {
  it('normalises', () => {
    expect(normaliseRuleKeyword('  Tésco  ')).toBe('tesco');
    expect(normaliseRuleKeyword('   ')).toBe('');
    expect(RULE_KEYWORD_MAX).toBe(60);
  });
});

describe('sharedTargetFor', () => {
  it('maps builtin, custom and system', () => {
    expect(sharedTargetFor({ builtinKey: 'Groceries', displayName: 'Food shop' })).toEqual({
      kind: 'builtin',
      key: 'Groceries',
    });
    expect(sharedTargetFor({ builtinKey: null, displayName: 'Gym' })).toEqual({ kind: 'name', name: 'Gym' });
    expect(sharedTargetFor({ builtinKey: 'Transfer', displayName: 'Transfer' })).toBeNull();
    expect(sharedTargetFor({ builtinKey: 'Settlement', displayName: 'Settlement' })).toBeNull();
  });
});

describe('resolveRules', () => {
  const personal = (id: string, keywordNorm: string, categoryId: string): StoredRule => ({
    id,
    scope: 'personal',
    keywordNorm,
    target: { kind: 'category', categoryId },
  });

  it('resolves personal rules to active non-system categories only', () => {
    const cats = [cat({ id: 'c1' }), cat({ id: 'c2', active: false }), cat({ id: 'c3', system: true })];
    const r = resolveRules(
      [personal('r1', 'a', 'c1'), personal('r2', 'b', 'c2'), personal('r3', 'c', 'c3'), personal('r4', 'd', 'zz')],
      cats
    );
    expect(r.personal).toEqual([{ keywordNorm: 'a', categoryId: 'c1' }]);
    expect(r.shared).toEqual([]);
    expect(r.byRuleId.get('r1')).toBe('c1');
    expect([...r.unresolvedIds].sort()).toEqual(['r2', 'r3', 'r4']);
  });

  it('resolves shared builtin even when renamed, and skips an archived builtin', () => {
    const cats = [
      cat({ id: 'g', builtinKey: 'Groceries', displayName: 'Food shop' }),
      cat({ id: 'h', builtinKey: 'Housing', active: false }),
    ];
    const rules: StoredRule[] = [
      { id: 's1', scope: 'shared', keywordNorm: 'tesco', target: { kind: 'builtin', key: 'Groceries' } },
      { id: 's2', scope: 'shared', keywordNorm: 'rent', target: { kind: 'builtin', key: 'Housing' } },
    ];
    const r = resolveRules(rules, cats);
    expect(r.shared).toEqual([{ keywordNorm: 'tesco', categoryId: 'g' }]);
    expect(r.unresolvedIds.has('s2')).toBe(true);
  });

  it('resolves shared name by normalised equality, lowest id on ties, unresolved otherwise', () => {
    const cats = [
      cat({ id: 'b', displayName: 'cafe' }),
      cat({ id: 'a', displayName: 'Café' }),
      cat({ id: 'x', displayName: 'cafe', active: false }),
      cat({ id: 'y', displayName: 'Gym', system: true }),
    ];
    const rules: StoredRule[] = [
      { id: 's1', scope: 'shared', keywordNorm: 'k', target: { kind: 'name', name: 'Café' } },
      { id: 's2', scope: 'shared', keywordNorm: 'g', target: { kind: 'name', name: 'Gym' } },
    ];
    const r = resolveRules(rules, cats);
    expect(r.shared).toEqual([{ keywordNorm: 'k', categoryId: 'a' }]);
    expect(r.unresolvedIds.has('s2')).toBe(true);
  });

  it('drops empty keywords as unresolved', () => {
    const r = resolveRules([personal('r1', '', 'c1')], [cat({ id: 'c1' })]);
    expect(r.personal).toEqual([]);
    expect(r.unresolvedIds.has('r1')).toBe(true);
  });
});

describe('hasRuleFor', () => {
  it('matches keyword and category', () => {
    const rules = [{ keywordNorm: 'tesco', categoryId: 'c1' }];
    expect(hasRuleFor(rules, 'tesco', 'c1')).toBe(true);
    expect(hasRuleFor(rules, 'tesco', 'c2')).toBe(false);
    expect(hasRuleFor(rules, 'asda', 'c1')).toBe(false);
  });
});
