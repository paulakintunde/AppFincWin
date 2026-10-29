import { SOMETHING_CHANGED, targetOf } from '../somethingChanged';

describe('somethingChanged targets', () => {
  it('lists the 7 choices in order', () => {
    expect(SOMETHING_CHANGED.map((c) => c.id)).toEqual(['pay', 'income', 'bill', 'account', 'share', 'emergency', 'unusual']);
  });

  it('pay goes to the pay step, or the income steps without a regular pay type', () => {
    expect(targetOf('pay', { hasRegularPay: true })).toEqual({ kind: 'route', href: '/decide/setup?only=pay' });
    expect(targetOf('pay', { hasRegularPay: false })).toEqual({ kind: 'route', href: '/decide/setup?mode=standalone' });
  });

  it('maps the other choices', () => {
    const f = { hasRegularPay: true };
    expect(targetOf('income', f)).toEqual({ kind: 'route', href: '/decide/setup?mode=standalone' });
    expect(targetOf('bill', f)).toEqual({ kind: 'route', href: '/decide/setup?only=regular' });
    expect(targetOf('account', f)).toEqual({ kind: 'route', href: '/decide/setup?only=accountUse' });
    expect(targetOf('share', f)).toEqual({ kind: 'route', href: '/decide/setup?only=share' });
    expect(targetOf('emergency', f)).toEqual({ kind: 'sheet', sheet: 'emergency' });
    expect(targetOf('unusual', f)).toEqual({ kind: 'route', href: '/decide/setup?only=unusual' });
  });

  it('unusual falls back to the everyday step under two full months', () => {
    expect(targetOf('unusual', { hasRegularPay: true, fullMonths: 1 })).toEqual({ kind: 'route', href: '/decide/setup?only=everyday' });
    expect(targetOf('unusual', { hasRegularPay: true, fullMonths: 2 })).toEqual({ kind: 'route', href: '/decide/setup?only=unusual' });
  });
});
