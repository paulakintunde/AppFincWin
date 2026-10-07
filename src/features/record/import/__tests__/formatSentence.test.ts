// 02-27 / D-42: the plain-words reading shown before any preview. Pure key/params assembly,
// rendered here through the real catalogue so the approved example sentence is pinned exactly.
import { i18n } from '@/i18n';
import type { FormatProfile } from '@/engine/statement';
import { formatSentenceKeys, renderSentence } from '../formatSentence';

function profile(over: Partial<FormatProfile>): FormatProfile {
  return {
    version: 1,
    source: 'ofx',
    accountFamily: 'card',
    positiveMeans: 'money-spent',
    balanceMeans: 'owed',
    statedLimit: null,
    decidedBy: 'labels',
    ...over,
  } as FormatProfile;
}

const t = (key: string, params?: Record<string, string>) => String(i18n.t(key as never, params as never));
const none = { closing: null, limit: null, overLimit: false };

describe('formatSentenceKeys', () => {
  it('renders the D-42 example exactly', () => {
    const parts = formatSentenceKeys(profile({}), { closing: '£1,250', limit: '£1,000', overLimit: true });
    expect(renderSentence(parts, t)).toBe(
      'We read this as a credit card statement. Purchases are shown as positive and payments as negative. The balance is what you owe: £1,250, which is over your £1,000 limit.'
    );
  });

  it('orders the parts: reading, sign, balance', () => {
    const parts = formatSentenceKeys(profile({}), { closing: '£1,250', limit: '£1,000', overLimit: true });
    expect(parts.map((p) => p.key)).toEqual([
      'importCsv.format.readAs',
      'importCsv.format.cardPositivePurchases',
      'importCsv.format.balanceOwedOverLimit',
    ]);
    expect(parts[0]?.params).toEqual({ type: 'importCsv.format.type.card' });
    expect(parts[2]?.params).toEqual({ amount: '£1,250', limit: '£1,000' });
  });

  it('card with money-in positive reads the other way round', () => {
    const parts = formatSentenceKeys(profile({ positiveMeans: 'money-in' }), none);
    expect(parts[1]?.key).toBe('importCsv.format.cardNegativePurchases');
  });

  it('deposit and loan sign sentences', () => {
    expect(formatSentenceKeys(profile({ accountFamily: 'deposit', positiveMeans: 'money-spent', balanceMeans: 'held' }), none)[1]?.key).toBe(
      'importCsv.format.depositPositiveOut'
    );
    expect(formatSentenceKeys(profile({ accountFamily: 'deposit', positiveMeans: 'money-in', balanceMeans: 'held' }), none)[1]?.key).toBe(
      'importCsv.format.depositPositiveIn'
    );
    expect(formatSentenceKeys(profile({ accountFamily: 'loan', positiveMeans: 'money-spent', balanceMeans: 'owed' }), none)[1]?.key).toBe(
      'importCsv.format.loanPositiveOut'
    );
    expect(formatSentenceKeys(profile({ accountFamily: 'loan', positiveMeans: 'money-in', balanceMeans: 'owed' }), none)[1]?.key).toBe(
      'importCsv.format.loanPositiveIn'
    );
  });

  it('balance sentences: owed under the limit, owed with no limit, held, available, none', () => {
    const owed = formatSentenceKeys(profile({}), { closing: '£400', limit: '£1,000', overLimit: false });
    expect(owed[2]).toEqual({ key: 'importCsv.format.balanceOwed', params: { amount: '£400' } });
    const noLimit = formatSentenceKeys(profile({}), { closing: '£400', limit: null, overLimit: false });
    expect(noLimit[2]?.key).toBe('importCsv.format.balanceOwed');
    const held = formatSentenceKeys(profile({ accountFamily: 'deposit', balanceMeans: 'held' }), { closing: '£90', limit: null, overLimit: false });
    expect(held[2]).toEqual({ key: 'importCsv.format.balanceHeld', params: { amount: '£90' } });
    const available = formatSentenceKeys(profile({ balanceMeans: 'available' }), none);
    expect(available[2]).toEqual({ key: 'importCsv.format.balanceAvailable' });
    const nothing = formatSentenceKeys(profile({ balanceMeans: 'none' }), none);
    expect(nothing).toHaveLength(2);
  });

  it('states no balance when the file has no closing figure to quote', () => {
    expect(formatSentenceKeys(profile({}), none)).toHaveLength(2);
  });
});
