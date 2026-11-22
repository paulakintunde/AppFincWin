// 08.1 review C-WR-02: a partner's figure counts only while the server has confirmed it recently; anything else is read as not shared.
import fc from 'fast-check';
import { freshPartnerTotal, PARTNER_MONEY_FRESH_MS } from '../partnerMoney';

jest.mock('@/services/supabase', () => ({ supabase: {} }));

const NOW = 1_800_000_000_000;
const FIGURE = { ok: true, rounded_left: 200_000, currency: 'USD', as_of: '2026-11-22' };

describe('freshPartnerTotal (C-WR-02, fail closed)', () => {
  it('counts a figure the server gave inside the window', () => {
    expect(freshPartnerTotal({ data: FIGURE, status: 'success', dataUpdatedAt: NOW - 1_000 }, NOW)).toBe(FIGURE);
    expect(freshPartnerTotal({ data: FIGURE, status: 'success', dataUpdatedAt: NOW - PARTNER_MONEY_FRESH_MS }, NOW)).toBe(FIGURE);
    // fetched after the check opened
    expect(freshPartnerTotal({ data: FIGURE, status: 'success', dataUpdatedAt: NOW + 2_000 }, NOW)).toBe(FIGURE);
  });

  it('a figure older than the window (a cached copy, offline) is not counted', () => {
    expect(freshPartnerTotal({ data: FIGURE, status: 'success', dataUpdatedAt: NOW - PARTNER_MONEY_FRESH_MS - 1 }, NOW)).toBeUndefined();
    expect(freshPartnerTotal({ data: FIGURE, status: 'success', dataUpdatedAt: NOW - 29 * 24 * 60 * 60 * 1000 }, NOW)).toBeUndefined();
  });

  it('a failed refetch keeps old data in the cache, and it is not counted', () => {
    expect(freshPartnerTotal({ data: FIGURE, status: 'error', dataUpdatedAt: NOW - 1_000 }, NOW)).toBeUndefined();
  });

  it('no data, or no fetch time, is not counted', () => {
    expect(freshPartnerTotal({ data: undefined, status: 'pending', dataUpdatedAt: 0 }, NOW)).toBeUndefined();
    expect(freshPartnerTotal({ data: FIGURE, status: 'success', dataUpdatedAt: 0 }, NOW)).toBeUndefined();
  });

  it('property: a counted figure was always confirmed by the server no more than the window before the check', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 60 * 24 * 60 * 60 * 1000 }), fc.constantFrom('success', 'error', 'pending'), (age, status) => {
        const got = freshPartnerTotal({ data: FIGURE, status, dataUpdatedAt: NOW - age }, NOW);
        return got === undefined || (status === 'success' && age <= PARTNER_MONEY_FRESH_MS);
      }),
    );
  });
});
