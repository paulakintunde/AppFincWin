import {
  BUILTIN_CATEGORY_KEYS,
  SYSTEM_CATEGORY_KEYS,
  CATEGORY_COLOR_KEYS,
  BUILTIN_COLOR_KEY,
  isCategoryColorKey,
} from '../builtins';

describe('builtins', () => {
  it('has exactly 13 built-in category keys (D-34, the prototype Component.COL seed)', () => {
    expect(BUILTIN_CATEGORY_KEYS.length).toBe(13);
  });

  it('has exactly 2 system category keys, Transfer and Settlement, never editable', () => {
    expect(SYSTEM_CATEGORY_KEYS.length).toBe(2);
    expect(SYSTEM_CATEGORY_KEYS).toContain('Transfer');
    expect(SYSTEM_CATEGORY_KEYS).toContain('Settlement');
  });

  it('has exactly 7 category colour pairs (D-35)', () => {
    expect(CATEGORY_COLOR_KEYS.length).toBe(7);
  });

  it('assigns a valid colour key to every built-in and system category', () => {
    for (const key of [...BUILTIN_CATEGORY_KEYS, ...SYSTEM_CATEGORY_KEYS]) {
      expect(CATEGORY_COLOR_KEYS).toContain(BUILTIN_COLOR_KEY[key]);
    }
  });

  it('isCategoryColorKey recognises a valid colour key', () => {
    expect(isCategoryColorKey('green')).toBe(true);
  });

  it('isCategoryColorKey rejects a string that is not a colour key', () => {
    expect(isCategoryColorKey('turquoise')).toBe(false);
  });
});
