import { loggedLately, setupProgress, SETUP_ORDER, type SetupFacts } from '../setupProgress';

const TODAY = '2026-11-20';
const base: SetupFacts = {
  hasPay: false, payAmountMinor: null, payDay: null,
  billsRightAnswered: false, billsCount: 0, billsMonthlyMinor: 0,
  debts: [], noDebtsAnswered: false,
  netSizeMinor: null, netNotSetAnswered: false,
  rulesOn: 0, noRulesAnswered: false,
  lastMonthComplete: false, newestEntryThisMonth: null, accountsAllHaveUse: false, recordsUpTo: null,
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
    expect(item(base, 'rules').done).toBe(false);
    expect(item(f({ rulesOn: 2 }), 'rules').status).toEqual({ key: 'rulesDone', values: { count: 2 } });
    expect(item(f({ noRulesAnswered: true }), 'rules').status.key).toBe('rulesNone');
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
