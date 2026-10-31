/** Plan 05.3-14: useV3Format turns model params into display and screen-reader strings. */
import { renderHook } from '@testing-library/react-native';
import { useV3Format } from '../useV3Format';

let mockCents = false;

jest.mock('@/services/locale/deviceLocale', () => ({
  useDeviceLocale: () => ({ locale: 'en-US', timeZone: 'UTC', separators: { decimal: '.', group: ',' } }),
}));
jest.mock('@/i18n', () => ({ useT: () => (k: string) => k }));
jest.mock('@/features/record/useRecordContext', () => ({
  useRecordContext: () => ({ userId: 'u', householdId: 'h', homeCurrency: 'USD', showCents: mockCents }),
}));
jest.mock('@/data/queries/categories', () => ({
  useCategoryLookup: () => ({ all: [{ id: 'cat-1', name: 'Groceries', builtin_key: null }] }),
}));
jest.mock('@/data/queries/accounts', () => ({ useAccounts: () => ({ data: [{ id: 'acc-1', name: 'Everyday' }] }) }));
jest.mock('@/data/queries/recurringSeries', () => ({ useRecurringSeries: () => ({ data: [{ id: 'ser-1', name: 'Rent' }] }) }));
jest.mock('@/data/queries/decide', () => ({ usePots: () => ({ data: { live: [{ id: 'env-1', name: 'Holiday' }], done: [] } }) }));

describe('useV3Format', () => {
  it('formats money without and with cents', async () => {
    mockCents = false;
    expect((await renderHook(() => useV3Format())).result.current.money(42500)).toBe('$425');
    mockCents = true;
    const f = (await renderHook(() => useV3Format())).result.current;
    expect(f.money(42500)).toBe('$425.00');
    expect(f.moneyA11y(42500)).toMatch(/425/);
    expect(f.moneyA11y(42500)).toMatch(/dollar/i);
  });

  it('05.3-88: a long amount carries no break point', async () => {
    mockCents = true;
    const f = (await renderHook(() => useV3Format())).result.current;
    expect(f.money(15005512401)).toBe('$150,055,124.01');
    expect(f.money(15005512401)).not.toContain('​');
    expect(f.params({ x: { kind: 'money', minor: 15005512401 } }).screen.x).not.toContain('​');
    expect(f.flat({ amount: 15005512401 }, ['amount']).screen.amount).not.toContain('​');
  });

  it('formats months and dates', async () => {
    mockCents = false;
    const f = (await renderHook(() => useV3Format())).result.current;
    expect(f.month('2026-10')).toBe('October');
    expect(f.monthYear('2027-02')).toBe('February 2027');
    expect(f.date('2026-10-28')).toMatch(/28/);
  });

  it('formats typed params for screen and a11y', async () => {
    mockCents = false;
    const f = (await renderHook(() => useV3Format())).result.current;
    const out = f.params({ month: { kind: 'month', ym: '2026-10' }, left: { kind: 'money', minor: 42500 }, n: { kind: 'count', n: 3 } });
    expect(out.screen).toEqual({ month: 'October', left: '$425', n: '3' });
    expect(out.a11y.left).toMatch(/dollar/i);
    expect(out.a11y.month).toBe('October');
  });

  it('resolves ids to names and never shows a raw id', async () => {
    mockCents = false;
    const f = (await renderHook(() => useV3Format())).result.current;
    const out = f.flat(
      { categoryId: 'cat-1', envelopeId: 'env-1', seriesId: 'ser-1', accountId: 'acc-1', amount: 1000, kind: 'x', lineId: 'zzz' },
      ['amount'],
    );
    expect(out.screen).toEqual({ category: 'Groceries', envelope: 'Holiday', bill: 'Rent', account: 'Everyday', amount: '$10' });
    const unknown = f.flat({ categoryId: 'does-not-exist' }, []);
    expect(unknown.screen).toEqual({ category: '' });
    expect(JSON.stringify([out, unknown])).not.toMatch(/cat-1|env-1|ser-1|acc-1|does-not-exist|zzz/);
  });
});
