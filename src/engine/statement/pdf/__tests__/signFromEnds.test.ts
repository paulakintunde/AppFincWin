import { signToTurn } from '../signFromEnds';

describe('signToTurn (D-24)', () => {
  // no-balances.pdf: 90000 before the file, +112170 across it, LITWARE BOOKS 18.50 read as money in.
  const amounts = [-4520, -1275, -8900, 150000, -3600, -2350, 1850, -5210, -6780, -3345];
  const open = amounts.map((_, i) => i === 6);

  it('turns the one open sign when only the other way round ties the ends', () => {
    expect(signToTurn(amounts, open, { opening: 90000, closing: 202170 })).toBe(6);
  });

  it('turns nothing when the file already ties as read', () => {
    expect(signToTurn(amounts, open, { opening: 90000, closing: 205870 })).toBeNull();
  });

  it('turns nothing when neither sign ties', () => {
    expect(signToTurn(amounts, open, { opening: 90000, closing: 200000 })).toBeNull();
  });

  it('needs both ends', () => {
    expect(signToTurn(amounts, open, { opening: null, closing: 202170 })).toBeNull();
    expect(signToTurn(amounts, open, { opening: 90000, closing: null })).toBeNull();
  });

  it('turns nothing when no sign, or more than one, is open', () => {
    expect(signToTurn(amounts, amounts.map(() => false), { opening: 90000, closing: 202170 })).toBeNull();
    const two = amounts.map((_, i) => i === 6 || i === 7);
    expect(signToTurn(amounts, two, { opening: 90000, closing: 202170 })).toBeNull();
  });

  it('a zero amount has no sign to open', () => {
    expect(signToTurn([0, 100], [true, false], { opening: 0, closing: 50 })).toBeNull();
  });

  it('an unreadable amount leaves the file unchecked', () => {
    expect(signToTurn([null, 100], [false, true], { opening: 0, closing: -100 })).toBeNull();
  });

  it('stays exact near the 1e13 ceiling', () => {
    const big = 9_999_999_999_999;
    expect(signToTurn([big, 1], [false, true], { opening: 0, closing: big - 1 })).toBe(1);
  });
});
