import { MEMBER_COLOUR_COUNT, nextFreeColour } from '../colours';

describe('nextFreeColour', () => {
  it('returns the lowest free index', () => {
    expect(nextFreeColour([])).toBe(0);
    expect(nextFreeColour([0, 1, 3])).toBe(2);
  });

  it('returns null when all six are taken', () => {
    expect(MEMBER_COLOUR_COUNT).toBe(6);
    expect(nextFreeColour([0, 1, 2, 3, 4, 5])).toBeNull();
  });
});
