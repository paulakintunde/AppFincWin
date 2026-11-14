// 06.1-29 FIN-20 (owner D-26, 2026-11-12): the pay setup set-aside field's pure rules.
import { MAX_SET_ASIDE_PERCENT, setAsideFromText, setAsidePatch, setAsideText, showsSetAside } from '../taxSetAside';

describe('FIN-20 the set-aside field', () => {
  it('reads a whole percent from 0 to 60 as basis points; empty is none; anything else is bad', () => {
    expect(setAsideFromText('')).toEqual({ kind: 'empty' });
    expect(setAsideFromText(' 25 ')).toEqual({ kind: 'ok', bp: 2500 });
    expect(setAsideFromText('0')).toEqual({ kind: 'ok', bp: 0 });
    expect(setAsideFromText(String(MAX_SET_ASIDE_PERCENT))).toEqual({ kind: 'ok', bp: 6000 });
    expect(setAsideFromText('61')).toEqual({ kind: 'bad' });
    expect(setAsideFromText('12.5')).toEqual({ kind: 'bad' });
  });
  it('shows the stored share as text, empty when none', () => {
    expect(setAsideText(null)).toBe('');
    expect(setAsideText(undefined)).toBe('');
    expect(setAsideText(2500)).toBe('25');
    expect(setAsideText(1250)).toBe('12.50');
  });
  it('shows only when the income types include freelance (own business counts as freelance)', () => {
    expect(showsSetAside(['freelance'])).toBe(true);
    expect(showsSetAside(['salary_or_wages', 'own_business'])).toBe(true);
    expect(showsSetAside(['salary_or_wages', 'commission_or_tips'])).toBe(false);
    expect(showsSetAside(['mix'])).toBe(false);
    expect(showsSetAside(null)).toBe(false);
    expect(showsSetAside(undefined)).toBe(false);
  });
  it('writes only a changed, valid share', () => {
    expect(setAsidePatch('25', null)).toBe(2500);
    expect(setAsidePatch('25', 2500)).toBeUndefined();
    expect(setAsidePatch('', 2500)).toBeNull();
    expect(setAsidePatch('', undefined)).toBeUndefined();
    expect(setAsidePatch('99', null)).toBeUndefined();
  });
});
