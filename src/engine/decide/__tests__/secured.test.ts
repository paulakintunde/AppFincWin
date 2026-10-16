import { isSecured, suggestSecured } from '../secured';

describe('isSecured', () => {
  it('reads the field', () => {
    expect(isSecured({ secured: true })).toBe(true);
    expect(isSecured({ secured: false })).toBe(false);
  });

  it('never consults the name', () => {
    const debt = { name: 'Mortgage', secured: false };
    expect(isSecured(debt)).toBe(false);
  });
});

describe('suggestSecured', () => {
  it.each<[string, boolean]>([
    ['Mortgage', true],
    ['Auto loan', true],
    ['Car finance', true],
    ['Home loan', true],
    ['Property loan', true],
    ['Visa card', false],
    ['Forester', false],
    ['', false],
  ])('%j -> %s', (name, expected) => {
    expect(suggestSecured(name)).toBe(expected);
  });
});
