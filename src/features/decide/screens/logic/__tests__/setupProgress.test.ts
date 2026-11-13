import type { ReadinessItem } from '@/engine/decide/v3';
import { loggedLately, setupProgress, SETUP_ORDER, type SetupFacts } from '../setupProgress';

const TODAY = '2026-11-20';
const base: SetupFacts = {
  hasPay: false, payAmountMinor: null, payDay: null,
  billsRightAnswered: false, billsCount: 0, billsMonthlyMinor: 0,
  debts: [], noDebtsAnswered: false,
  netSizeMinor: null, netNotSetAnswered: false,
  rulesOn: 0, noRulesAnswered: false,
  lastMonthComplete: false, newestEntryThisMonth: null, accountsAllHaveUse: false, recordsUpTo: null,
  readinessOpen: 0, readinessFirst: null,
};
const f = (over: Partial<SetupFacts>): SetupFacts => ({ ...base, ...over });
const item = (facts: SetupFacts, id: string) => setupProgress(facts, TODAY).items.find((i) => i.id === id)!;

describe('setupProgress', () => {
  it('lists the six items in order, none done, next is pay', () => {
    const p = setupProgress(base, TODAY);
    expect(p.items.map((i) => i.id)).toEqual([...SETUP_ORDER]);
    expect(p.doneCount).toBe(0);
    expect(p.next).toBe('pay');
    expect(p.allDone).toBe(false);
  });

  it('pay: done with amount and day, with zero fallbacks', () => {
    expect(item(f({ hasPay: true, payAmountMinor: 250000, payDay: 25 }), 'pay')).toEqual({ id: 'pay', done: true, status: { key: 'payDone', values: { amountMinor: 250000, day: 25 } } });
    expect(item(f({ hasPay: true }), 'pay').status.values).toEqual({ amountMinor: 0, day: 0 });
  });

  it('bills: done only on the "These bills are right" flag', () => {
    expect(item(f({ billsCount: 4 }), 'bills').done).toBe(false);
    expect(item(base, 'bills').status).toEqual({ key: 'billsNone', values: {} });
    expect(item(f({ billsRightAnswered: true, billsCount: 4, billsMonthlyMinor: 90000 }), 'bills').status).toEqual({ key: 'billsDone', values: { count: 4, monthlyMinor: 90000 } });
  });

  it('debts: no debts needs the flag; debts need due days', () => {
    expect(item(base, 'debts').done).toBe(false);
    expect(item(f({ noDebtsAnswered: true }), 'debts').status.key).toBe('debtsNone');
    const open = item(f({ debts: [{ name: 'Car', dueDay: 3 }, { name: 'Visa card', dueDay: null }] }), 'debts');
    expect(open).toEqual({ id: 'debts', done: false, status: { key: 'debtsOpen', values: { count: 1, debt: 'Visa card' } } });
    expect(item(f({ debts: [{ name: 'Car', dueDay: 3 }] }), 'debts').status).toEqual({ key: 'debtsDone', values: { debt: 'Car', day: 3 } });
    // dueDay can never be null on a done debt; the day falls back to 0 only for the type
    expect(item(f({ debts: [{ name: 'Car', dueDay: 3 }], noDebtsAnswered: true }), 'debts').done).toBe(true);
  });

  it('net: a sized goal, or the "Not set yet" flag, ticks it', () => {
    expect(item(base, 'net').done).toBe(false);
    expect(item(f({ netSizeMinor: 500000 }), 'net').status).toEqual({ key: 'netDone', values: { amountMinor: 500000 } });
    expect(item(f({ netNotSetAnswered: true }), 'net').status.key).toBe('netNotSet');
    expect(item(f({ netSizeMinor: 1, netNotSetAnswered: true }), 'net').status.key).toBe('netDone');
  });

  it('rules: a rule that is on, or the "No rules" flag', () => {
    expect(item(base, 'rules')).toEqual({ id: 'rules', done: false, status: { key: 'rulesOpen', values: {} } });
    expect(item(f({ rulesOn: 2 }), 'rules').status).toEqual({ key: 'rulesDone', values: { count: 2 } });
    expect(item(f({ noRulesAnswered: true }), 'rules').status.key).toBe('rulesNone');
  });

  it('06.1-45 (A-SU-2): bills open with 3 says 3 bills to confirm', () => {
    expect(item(f({ billsCount: 3 }), 'bills')).toEqual({ id: 'bills', done: false, status: { key: 'billsOpen', values: { count: 3 } } });
  });

  describe('records (D-11)', () => {
    const ok = { lastMonthComplete: true, accountsAllHaveUse: true, recordsUpTo: '2026-11-18' };
    it('newest entry exactly 10 days ago is done, 11 days is open', () => {
      expect(item(f({ ...ok, newestEntryThisMonth: '2026-11-10' }), 'records')).toEqual({ id: 'records', done: true, status: { key: 'recordsDone', values: { date: '2026-11-18' } } });
      expect(item(f({ ...ok, newestEntryThisMonth: '2026-11-09' }), 'records').done).toBe(false);
    });
    it('each part is needed; month count is not', () => {
      const fresh = '2026-11-19';
      expect(item(f({ ...ok, newestEntryThisMonth: fresh, lastMonthComplete: false }), 'records').done).toBe(false);
      expect(item(f({ ...ok, newestEntryThisMonth: fresh, accountsAllHaveUse: false }), 'records').done).toBe(false);
      expect(item(f({ ...ok, newestEntryThisMonth: null }), 'records').done).toBe(false);
      expect(item(f({ ...ok, newestEntryThisMonth: fresh }), 'records').done).toBe(true);
    });
    it('the date falls back to today when records have no date', () => {
      expect(item(f({ recordsUpTo: null }), 'records').status.values).toEqual({ date: TODAY });
    });
    it('06.1-45 (C-4, GQ2): D-11 true with 1 open readiness item is not done, and names the item', () => {
      const bill: ReadinessItem = {
        kind: 'bill', code: 'past_month_missing', month: '2026-10', seriesId: 's1', envelopeId: null, lineId: null, name: 'Netflix', amount: 1199 as ReadinessItem['amount'], date: '2026-10-03',
      };
      const r = item(f({ ...ok, newestEntryThisMonth: '2026-11-19', readinessOpen: 1, readinessFirst: bill }), 'records');
      expect(r).toEqual({ id: 'records', done: false, status: { key: 'recordsOpenItems', values: { count: 1, asOf: TODAY }, first: bill } });
      const p = setupProgress(f({ ...ok, newestEntryThisMonth: '2026-11-19', readinessOpen: 1, readinessFirst: bill }), TODAY);
      expect(p.doneCount).toBe(0);
    });
    it('06.1-45 (C-4): D-11 true with 0 readiness items is done', () => {
      expect(item(f({ ...ok, newestEntryThisMonth: '2026-11-19', readinessOpen: 0 }), 'records').done).toBe(true);
    });
    it('06.1-45: open readiness items lead the reason even when D-11 also fails', () => {
      expect(item(f({ readinessOpen: 2, readinessFirst: null }), 'records').status).toEqual({ key: 'recordsOpenItems', values: { count: 2, asOf: TODAY }, first: null });
    });
    it('loggedLately handles null and today', () => {
      expect(loggedLately(null, TODAY)).toBe(false);
      expect(loggedLately(TODAY, TODAY)).toBe(true);
    });
  });

  it('the spec case: pay, bills, net, rules done; debts and records open -> 4 of 6, next debts', () => {
    const p = setupProgress(
      f({
        hasPay: true, payAmountMinor: 100, payDay: 1, billsRightAnswered: true, netNotSetAnswered: true, rulesOn: 1,
        debts: [{ name: 'Visa card', dueDay: null }], recordsUpTo: '2026-11-15',
      }),
      TODAY,
    );
    expect(p.doneCount).toBe(4);
    expect(p.next).toBe('debts');
    expect(p.allDone).toBe(false);
  });

  it('all done leaves next null', () => {
    const p = setupProgress(
      f({ hasPay: true, billsRightAnswered: true, noDebtsAnswered: true, netNotSetAnswered: true, noRulesAnswered: true, lastMonthComplete: true, accountsAllHaveUse: true, newestEntryThisMonth: TODAY }),
      TODAY,
    );
    expect(p.allDone).toBe(true);
    expect(p.next).toBeNull();
  });
});
