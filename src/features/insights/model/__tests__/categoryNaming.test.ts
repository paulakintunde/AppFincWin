// 07 D-32: what Insights shows for a category id: the viewer's own, a partner's own on a shared line, or no category.
import type { TFunction } from 'i18next';
import type { CategoryRow } from '@/db/rows';
import { NO_NAMING, filterIdsOf, shownCategory, type CategoryNaming } from '../categoryNaming';

const t = ((key: string, o?: Record<string, string>) =>
  key === 'insights.categories.partnerCategory' ? `${o?.name} (${o?.partner})` : key === 'insights.categories.uncategorised' ? 'No category' : `[${key}]`) as unknown as TFunction;

const own = new Map<string, CategoryRow>([
  ['c-food', { id: 'c-food', builtin_key: 'Groceries', name: null, color_key: 'green', icon_key: null } as unknown as CategoryRow],
  ['c-blank', { id: 'c-blank', builtin_key: null, name: '', color_key: 'slate' } as unknown as CategoryRow],
]);
const naming: CategoryNaming = {
  partners: new Map([
    ['p-pets', { id: 'p-pets', owner_id: 'u2', builtin_key: null, name: 'Pets', color_key: 'plum', icon_key: 'paw' }],
    ['p-gift', { id: 'p-gift', owner_id: 'u2', builtin_key: 'Gifts', name: null, color_key: null, icon_key: null }],
    ['p-blank', { id: 'p-blank', owner_id: 'u3', builtin_key: null, name: null, color_key: null, icon_key: null }],
  ]),
  sourceIds: { 'c-food': ['c-food', 'p-food'] },
  partnerName: (id) => (id === 'u2' ? 'Sam' : ''),
};

describe('shownCategory', () => {
  it('the viewer’s own category by its own name', () => {
    expect(shownCategory('c-food', own, naming, t)).toEqual({ name: '[categories.builtin.Groceries]', glyph: { color_key: 'green', builtin_key: 'Groceries', icon_key: null } });
    expect(shownCategory('c-blank', own, naming, t).name).toBe('No category');
  });

  it('a partner’s category with whose it is', () => {
    expect(shownCategory('p-pets', own, naming, t)).toEqual({ name: 'Pets (Sam)', glyph: { color_key: 'plum', builtin_key: null, icon_key: 'paw' } });
    expect(shownCategory('p-gift', own, naming, t).name).toBe('[categories.builtin.Gifts] (Sam)');
    expect(shownCategory('p-blank', own, naming, t).name).toBe('No category');
  });

  it('no category, or an id nobody can name, reads as no category', () => {
    expect(shownCategory(null, own, naming, t)).toEqual({ name: 'No category', glyph: null });
    expect(shownCategory('someone-private', own, naming, t)).toEqual({ name: 'No category', glyph: null });
    expect(shownCategory('p-pets', own, NO_NAMING, t).glyph).toBeNull();
  });

  it('a merged row taps every stored id behind it', () => {
    expect(filterIdsOf('c-food', naming)).toEqual(['c-food', 'p-food']);
    expect(filterIdsOf('p-pets', naming)).toEqual(['p-pets']);
    expect(filterIdsOf(null, naming)).toEqual([null]);
    expect(NO_NAMING.partnerName('x')).toBe('');
  });
});
