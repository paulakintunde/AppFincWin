// 10.1-13 (D-16): a likely category for an item from the user's own rules and past lines, then from the store, else none.
import { guessCategory, type GuessContext } from '../categorize/guessCategory';

function useful(name: string, ctx: GuessContext): string | null {
  const g = guessCategory({ name, amount: -1 }, ctx);
  return g.categoryId !== null && g.source !== 'income-default' ? g.categoryId : null;
}

export function suggestItemCategory(itemName: string, storeName: string | null, ctx: GuessContext): { categoryId: string | null; source: 'item' | 'store' | 'none' } {
  const item = useful(itemName, ctx);
  if (item !== null) return { categoryId: item, source: 'item' };
  if (storeName !== null) {
    const store = useful(storeName, ctx);
    if (store !== null) return { categoryId: store, source: 'store' };
  }
  return { categoryId: null, source: 'none' };
}
