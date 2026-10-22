import { isUuid, oneParam, uuidParam } from '../routeParams';

const ID = '0f8e2a4c-1b2d-4c3e-9f0a-1234567890ab';

describe('routeParams (IN-D04)', () => {
  it('isUuid accepts a hyphenated uuid in either case and nothing else', () => {
    expect(isUuid(ID)).toBe(true);
    expect(isUuid(ID.toUpperCase())).toBe(true);
    expect(isUuid(`${ID}x`)).toBe(false);
    expect(isUuid('not-a-uuid')).toBe(false);
    expect(isUuid(undefined)).toBe(false);
    expect(isUuid(42)).toBe(false);
  });

  it('oneParam takes the first of a repeated param', () => {
    expect(oneParam(['a', 'b'])).toBe('a');
    expect(oneParam('a')).toBe('a');
    expect(oneParam(undefined)).toBeUndefined();
  });

  it('uuidParam gives the id or null, for a single or repeated param', () => {
    expect(uuidParam(ID)).toBe(ID);
    expect(uuidParam([ID, 'x'])).toBe(ID);
    expect(uuidParam(['x', ID])).toBeNull();
    expect(uuidParam(undefined)).toBeNull();
  });
});
