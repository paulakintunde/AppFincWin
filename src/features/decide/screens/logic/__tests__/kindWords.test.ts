import { CAR_WORDS, HOME_EXCEPTIONS, HOME_WORDS, PLAN_WORDS, TECH_WORDS, isHomeWords, readKind, readsAsPlan } from '../kindWords';

describe('isHomeWords (D-02)', () => {
  it.each(['a house', 'flat in Leeds', 'condo', 'mortgage on a home', 'Apartment', 'HOME', 'a townhouse', 'my new house!'])(
    '"%s" reads as a home',
    (text) => {
      expect(isHomeWords(text)).toBe(true);
    },
  );

  it.each(['home theatre', 'home office chair', 'house plant', 'phone', 'Home Cinema', 'home gym', 'house insurance', 'home decor', 'flat screen tv', '', 'households'])(
    '"%s" does not read as a home',
    (text) => {
      expect(isHomeWords(text)).toBe(false);
    },
  );

  it('a home word later in the text still counts after an exception', () => {
    expect(isHomeWords('home office in a new flat')).toBe(true);
  });
});

describe('readKind', () => {
  it.each<[string, ReturnType<typeof readKind>]>([
    ['a used car', 'car'],
    ['Van', 'car'],
    ['motorbike', 'car'],
    ['Pickup truck', 'car'],
    ['a house', 'home'],
    ['condo deposit', 'home'],
    ['laptop', 'tech'],
    ['new TV', 'tech'],
    ['noise cancelling headphones', 'tech'],
    ['home theatre', null],
    ['sofa', null],
    ['carpet', null],
  ])('"%s" -> %s', (text, kind) => {
    expect(readKind(text)).toBe(kind);
  });

  it('home wins over car when both appear', () => {
    expect(readKind('house and a car')).toBe('home');
  });
});

describe('readsAsPlan', () => {
  it.each(['car on finance', 'a loan for a van', 'Laptop on a plan', 'monthly payments', 'in installments', 'mortgage'])('"%s" is paid over time', (text) => {
    expect(readsAsPlan(text)).toBe(true);
  });

  it.each(['laptop', 'a plant', 'monthly', 'on a planet'])('"%s" is not', (text) => {
    expect(readsAsPlan(text)).toBe(false);
  });
});

describe('word tables are data', () => {
  it('are frozen lower-case lists', () => {
    for (const list of [CAR_WORDS, HOME_WORDS, HOME_EXCEPTIONS, TECH_WORDS, PLAN_WORDS]) {
      expect(Object.isFrozen(list)).toBe(true);
      for (const w of list) expect(w).toBe(w.toLowerCase());
    }
  });
});
