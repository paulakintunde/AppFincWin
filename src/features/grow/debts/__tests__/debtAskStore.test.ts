// 261123 (DD-05): what an older debt is missing, and the per-device "Not now".
import AsyncStorage from '@react-native-async-storage/async-storage';
import { debtAskKey, debtAskOf, dismissDebtAsk, resetDebtAsksForTests } from '../debtAskStore';

const base = { kind: 'loan' as const, revolving: null, start_date: null, started_balance: null, credit_limit: null, deleted_at: null };

describe('debtAskOf', () => {
  it('a fixed loan names its missing start date and original amount', () => {
    expect(debtAskOf(base)).toBe('startAndOriginal');
    expect(debtAskOf({ ...base, started_balance: 100 })).toBe('start');
    expect(debtAskOf({ ...base, start_date: '2024-01-01' })).toBe('original');
    expect(debtAskOf({ ...base, start_date: '2024-01-01', started_balance: 100 })).toBeNull();
  });
  it('money owed (other, not revolving) is a fixed loan too', () => {
    expect(debtAskOf({ ...base, kind: 'other', revolving: false })).toBe('startAndOriginal');
  });
  it('a card or line of credit names its missing limit', () => {
    expect(debtAskOf({ ...base, kind: 'card' })).toBe('limit');
    expect(debtAskOf({ ...base, kind: 'other', revolving: true })).toBe('limit');
    expect(debtAskOf({ ...base, kind: 'card', credit_limit: 0 })).toBeNull();
  });
  it('an older other row, or a removed debt, is not asked about', () => {
    expect(debtAskOf({ ...base, kind: 'other' })).toBeNull();
    expect(debtAskOf({ ...base, deleted_at: '2026-01-01' })).toBeNull();
  });
});

describe('dismissDebtAsk', () => {
  beforeEach(async () => {
    resetDebtAsksForTests();
    await AsyncStorage.clear();
  });
  it('remembers the debt id per user on this device', async () => {
    await dismissDebtAsk('u1', 'd1');
    await dismissDebtAsk('u1', 'd2');
    expect(JSON.parse((await AsyncStorage.getItem(debtAskKey('u1'))) ?? 'null')).toEqual({ v: 1, ids: ['d1', 'd2'] });
    expect(debtAskKey('u1').startsWith('fincwin:')).toBe(true);
  });
});
