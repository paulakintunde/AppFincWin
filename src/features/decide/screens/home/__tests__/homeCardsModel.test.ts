// 06.1-80 (DC-7, OQ-80-1 A): "Add your own rule" offers only kinds not already on the list.
import { ADD_RULE_KINDS, kindsOffered, EMPTY_RULES, type RulesDoc } from '../homeCardsModel';

const rule = (id: string, kind: 'keep' | 'largest' | 'category_cap' | 'category_share', on = true) => ({
  id,
  kind,
  on,
  value: 100,
  categoryId: kind === 'category_cap' || kind === 'category_share' ? 'c' : null,
});

describe('kindsOffered (OQ-80-1 A)', () => {
  it('offers every kind when no rule is on the list, in the sheet’s order', () => {
    expect(kindsOffered(EMPTY_RULES)).toEqual(['category_cap', 'category_share', 'largest', 'keep']);
    expect(kindsOffered(EMPTY_RULES)).toEqual([...ADD_RULE_KINDS]);
  });

  it('leaves out Largest single purchase and Keep at least once they are on the list, even when switched off', () => {
    const doc: RulesDoc = { v: 1, rules: [rule('own_largest', 'largest', false), rule('own_keep', 'keep')] };
    expect(kindsOffered(doc)).toEqual(['category_cap', 'category_share']);
  });

  it('keeps offering category rules, which can repeat', () => {
    const doc: RulesDoc = { v: 1, rules: [rule('own_category_cap_1', 'category_cap'), rule('own_category_share_2', 'category_share')] };
    expect(kindsOffered(doc)).toEqual(['category_cap', 'category_share', 'largest', 'keep']);
  });
});
