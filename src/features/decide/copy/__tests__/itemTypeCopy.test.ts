import { i18n } from '@/i18n';
import { refText } from '../../check/refText';
import { buy } from '../../check/steps/__tests__/helpers/stepProps';
import { itemTypeDisplay } from '../itemTypeCopy';
import type { CopyRef } from '../types';

const t = (key: string, params?: Record<string, string | number>): string => String((i18n.t as (k: string, o?: Record<string, string | number>) => unknown)(key, params));
const nameText = (n: string | CopyRef): string => (typeof n === 'string' ? n : refText(t, n));

describe('itemTypeDisplay', () => {
  it('D-81 a built-in type reads its label and has no treated-like line', () => {
    const d = itemTypeDisplay(buy({ itemType: 'rent_bill' }));
    expect(nameText(d.name)).toBe('Rent or bill');
    expect(d.treatedLike).toBeNull();
  });

  it('D-81 a custom type reads the name, and treated like only when set', () => {
    const plain = itemTypeDisplay(buy({ customItemType: { name: 'Drone', treatLike: null } }));
    expect(plain.name).toBe('Drone');
    expect(plain.treatedLike).toBeNull();
    const like = itemTypeDisplay(buy({ itemType: 'vehicle', customItemType: { name: 'Drone', treatLike: 'vehicle' } }));
    expect(like.name).toBe('Drone');
    expect(refText(t, like.treatedLike!)).toBe('treated like Vehicle');
  });
});
