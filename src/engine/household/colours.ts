export const MEMBER_COLOUR_COUNT = 6;

/** Lowest colour index (0..5) not in `taken`, or null when all six are used. */
export function nextFreeColour(taken: readonly number[]): number | null {
  for (let i = 0; i < MEMBER_COLOUR_COUNT; i++) {
    if (!taken.includes(i)) return i;
  }
  return null;
}
