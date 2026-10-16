import { parseQuick } from '../quickParse';

const parse = (s: string): number | null => {
  const clean = s.replace(/,/g, '');
  return /^\d+$/.test(clean) ? Number(clean) * 100 : null;
};

describe('parseQuick', () => {
  it('splits name and price', () => {
    expect(parseQuick('car 14500', parse)).toEqual({ name: 'Car', price: 1_450_000 });
    expect(parseQuick('sofa 1,800', parse)).toEqual({ name: 'Sofa', price: 180_000 });
  });
  it('allows an empty name', () => {
    expect(parseQuick('14500', parse)).toEqual({ name: '', price: 1_450_000 });
  });
  it('ignores surrounding spaces', () => {
    expect(parseQuick('  car 14500  ', parse)).toEqual({ name: 'Car', price: 1_450_000 });
  });
  it('rejects no number, zero and unparseable', () => {
    expect(parseQuick('new car', parse)).toBeNull();
    expect(parseQuick('car 0', parse)).toBeNull();
    expect(parseQuick('car 1.2.3', parse)).toBeNull();
  });
});
