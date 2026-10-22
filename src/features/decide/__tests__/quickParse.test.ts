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
  it('WR-B08: the price is the last number; model numbers, counts and years stay in the name', () => {
    expect(parseQuick('iPhone 15 Pro 1199', parse)).toEqual({ name: 'iPhone 15 Pro', price: 119_900 });
    expect(parseQuick('2 tickets 150', parse)).toEqual({ name: '2 tickets', price: 15_000 });
    expect(parseQuick('Sofa 2024 1,800', parse)).toEqual({ name: 'Sofa 2024', price: 180_000 });
    expect(parseQuick('PS5 $499', parse)).toEqual({ name: 'PS5', price: 49_900 });
    expect(parseQuick('Mr. Coffee 80', parse)).toEqual({ name: 'Mr. Coffee', price: 8_000 });
    expect(parseQuick('1200 for a bike', parse)).toEqual({ name: 'For a bike', price: 120_000 });
    expect(parseQuick('car 14500.', parse)).toEqual({ name: 'Car', price: 1_450_000 });
  });
});
