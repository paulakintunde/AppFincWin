// 10.1-04 (D-04): a split line's primary category is its largest part, ties to the lowest index.
import type { Part } from './types';

export function primaryCategory(parts: readonly Part[]): string | null {
  let best = 0;
  for (let i = 1; i < parts.length; i++) {
    if (Math.abs(parts[i]!.amount) > Math.abs(parts[best]!.amount)) best = i;
  }
  return parts[best]?.categoryId ?? null;
}
