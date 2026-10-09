import fc from 'fast-check';
import { pendingSplit } from '../pending';

describe('pendingSplit', () => {
  it('splits and computes after', () => {
    expect(pendingSplit({ balance: 10000, pendingIn: '2500', pendingOut: '-4000' })).toEqual({
      comingIn: 2500,
      goingOut: 4000,
      after: 8500,
      overflow: false,
    });
  });
  it('zeros', () => {
    expect(pendingSplit({ balance: 7, pendingIn: '0', pendingOut: '0' })).toMatchObject({
      comingIn: 0,
      goingOut: 0,
      after: 7,
    });
  });
  it('null balance overflows', () => {
    expect(pendingSplit({ balance: null, pendingIn: '1', pendingOut: '0' })).toMatchObject({
      after: null,
      overflow: true,
    });
  });
  it('huge sums flag overflow', () => {
    const big = '99999999999999999999';
    expect(pendingSplit({ balance: 0, pendingIn: big, pendingOut: '0' })).toMatchObject({
      comingIn: null,
      overflow: true,
    });
    expect(pendingSplit({ balance: 0, pendingIn: '0', pendingOut: '-' + big })).toMatchObject({
      goingOut: null,
      overflow: true,
    });
  });
  it('rejects contract violations', () => {
    expect(() => pendingSplit({ balance: 0, pendingIn: '-1', pendingOut: '0' })).toThrow(RangeError);
    expect(() => pendingSplit({ balance: 0, pendingIn: '0', pendingOut: '1' })).toThrow(RangeError);
    expect(() => pendingSplit({ balance: 0, pendingIn: 'x', pendingOut: '0' })).toThrow(RangeError);
    expect(() => pendingSplit({ balance: 0, pendingIn: '0', pendingOut: '1.5' })).toThrow(
      RangeError,
    );
  });
  it('property: after = balance + in - out', () => {
    fc.assert(
      fc.property(fc.integer({ min: -1e9, max: 1e9 }), fc.nat(1e9), fc.nat(1e9), (b, i, o) => {
        const r = pendingSplit({ balance: b, pendingIn: String(i), pendingOut: String(-o) });
        expect(r.overflow).toBe(false);
        expect(r.after).toBe(b + i - o);
      }),
    );
  });
});
