// 10.1-04 (D-02): the "left / over / adds up" label maths for the split sheet. Works on magnitudes.
import type { Balance } from './types';

export function partsBalance(total: number, amounts: readonly (number | null)[]): Balance {
  const sum = amounts.reduce<number>((s, a) => s + Math.abs(a ?? 0), 0);
  const diff = Math.abs(total) - sum;
  if (diff === 0) return { state: 'addsUp', amount: 0 };
  return diff > 0 ? { state: 'left', amount: diff } : { state: 'over', amount: -diff };
}
