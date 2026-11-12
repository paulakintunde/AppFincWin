// 06-14 (D-26, T-06-14-03): the net-worth rule on the LEDGER and on linked / unlinked investment accounts.
import { accounts as ledgerAccounts, holdings as ledgerHoldings, netWorth as LEDGER_NET, autoLoan } from '@/engine/grow/__tests__/fixtures/ledger';
import { netWorthOf, type NetWorthAccount, type NetWorthDebt, type NetWorthHolding } from '../netWorth';

const ACCOUNTS: NetWorthAccount[] = [
  { id: 'chk', kind: 'checking' },
  { id: 'sav', kind: 'savings' },
  { id: 'cash', kind: 'cash' },
  { id: 'visa', kind: 'credit' },
];
const BALANCES = new Map<string, number>([
  ['chk', ledgerAccounts.checking],
  ['sav', ledgerAccounts.savings],
  ['cash', ledgerAccounts.cash],
  ['visa', ledgerAccounts.visa],
]);
const HOLDINGS: NetWorthHolding[] = [
  { account_id: null, value: ledgerHoldings.retirement.value },
  { account_id: null, value: ledgerHoldings.index.value },
];
// The Visa debt is tracked by the credit account (already negative in its balance); the auto loan has no account.
const DEBTS: NetWorthDebt[] = [
  { account_id: 'visa', balance: 39768 },
  { account_id: null, balance: autoLoan.balance },
];

describe('netWorthOf', () => {
  it('LEDGER: 403500', () => {
    expect(netWorthOf({ accounts: ACCOUNTS, balances: BALANCES, holdings: HOLDINGS, debts: DEBTS })).toBe(LEDGER_NET);
    expect(LEDGER_NET).toBe(403500);
  });

  it('an investment account with no holding counts its balance: 903500', () => {
    const accounts = [...ACCOUNTS, { id: 'inv', kind: 'investment' as const }];
    const balances = new Map(BALANCES).set('inv', 500000);
    expect(netWorthOf({ accounts, balances, holdings: HOLDINGS, debts: DEBTS })).toBe(903500);
  });

  it('once a holding sits in the investment account its balance is left out (no double count)', () => {
    const accounts = [...ACCOUNTS, { id: 'inv', kind: 'investment' as const }];
    const balances = new Map(BALANCES).set('inv', 500000);
    // One of the existing holdings now sits in the account: the balance drops out and the holding stays in.
    const linked: NetWorthHolding[] = [{ account_id: 'inv', value: ledgerHoldings.retirement.value }, HOLDINGS[1]!];
    expect(netWorthOf({ accounts, balances, holdings: linked, debts: DEBTS })).toBe(LEDGER_NET);
    // A new holding in the account adds only its own value.
    const extra: NetWorthHolding[] = [...HOLDINGS, { account_id: 'inv', value: 120000 }];
    expect(netWorthOf({ accounts, balances, holdings: extra, debts: DEBTS })).toBe(LEDGER_NET + 120000);
  });

  it('a removed holding no longer hides the account balance', () => {
    const accounts = [...ACCOUNTS, { id: 'inv', kind: 'investment' as const }];
    const balances = new Map(BALANCES).set('inv', 500000);
    const gone: NetWorthHolding[] = [...HOLDINGS, { account_id: 'inv', value: 120000, deleted_at: '2026-11-01T00:00:00Z' }];
    expect(netWorthOf({ accounts, balances, holdings: gone, debts: DEBTS })).toBe(903500);
  });

  it('a debt linked to an account is not taken off twice; paid-off and removed debts are ignored', () => {
    const only: NetWorthDebt[] = [
      { account_id: 'visa', balance: 39768 },
      { account_id: null, balance: autoLoan.balance, paid_off: true },
      { account_id: null, balance: 100000, deleted_at: '2026-11-01T00:00:00Z' },
    ];
    expect(netWorthOf({ accounts: ACCOUNTS, balances: BALANCES, holdings: HOLDINGS, debts: only })).toBe(LEDGER_NET + autoLoan.balance);
  });

  it('removed accounts and accounts with no balance count as zero; nothing at all is zero', () => {
    const accounts: NetWorthAccount[] = [...ACCOUNTS, { id: 'old', kind: 'checking', deleted_at: '2026-10-01T00:00:00Z' }, { id: 'new', kind: 'checking' }];
    const balances = new Map(BALANCES).set('old', 99999);
    expect(netWorthOf({ accounts, balances, holdings: HOLDINGS, debts: DEBTS })).toBe(LEDGER_NET);
    expect(netWorthOf({ accounts: [], balances: new Map(), holdings: [], debts: [] })).toBe(0);
  });
});
