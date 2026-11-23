// 07-03 (T-07-08, D-08): every point equals netWorthOf of the inputs that point used; there is no second sum.
import fc from 'fast-check';
import { fcRuns } from '../../decide/v3/__tests__/helpers/fcRuns';
import { netWorthOf, type NetWorthDebt, type NetWorthHolding } from '../netWorth';
import { holdingValueOn, netWorthSeries, type SeriesAccount, type SeriesDebt, type SeriesHolding } from '../netWorthSeries';

const DATES = ['2026-03-31', '2026-06-30', '2026-09-30'];
const day = fc.constantFrom('2026-01-01', '2026-04-15', '2026-07-20', '2026-10-05');
const amt = fc.integer({ min: -1_000_000, max: 1_000_000 });
const kind = fc.constantFrom('checking', 'savings', 'credit', 'investment', 'loan') as fc.Arbitrary<SeriesAccount['kind']>;

describe('netWorthSeries property', () => {
  it('each point is netWorthOf of its own inclusion', () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({ kind, createdOn: day, bal: amt, leg: fc.boolean() }), { maxLength: 4 }),
        fc.array(
          fc.record({ linked: fc.option(fc.nat(3), { nil: null }), lots: fc.array(fc.record({ date: day, amount: amt }), { maxLength: 3 }) }),
          { maxLength: 3 },
        ),
        fc.array(
          fc.record({ balance: fc.nat(100000), started: fc.option(fc.nat(100000), { nil: null }), paid: fc.option(day, { nil: null }), linked: fc.option(fc.nat(3), { nil: null }) }),
          { maxLength: 3 },
        ),
        fc.boolean(),
        (accIn, holdIn, debtIn, lastIsToday) => {
          const accounts: SeriesAccount[] = accIn.map((a, i) => ({ id: `a${i}`, kind: a.kind, createdOn: a.createdOn }));
          const holdings: SeriesHolding[] = holdIn.map((h, i) => ({ id: `h${i}`, account_id: h.linked === null ? null : `a${h.linked}`, lots: h.lots }));
          const debts: SeriesDebt[] = debtIn.map((d) => ({
            account_id: d.linked === null ? null : `a${d.linked}`,
            balance: d.balance,
            startedBalance: d.started,
            paidOffOn: d.paid,
          }));
          const balances = new Map(accIn.map((a, i) => [`a${i}`, a.bal] as [string, number]));
          const legs = new Set(accIn.flatMap((a, i) => (a.leg ? [`a${i}`] : [])));
          const points = DATES.map((date, i) => ({ date, isToday: lastIsToday && i === DATES.length - 1, balances, accountsWithLegs: legs }));
          const out = netWorthSeries({ accounts, holdings, debts, points });

          points.forEach((p, i) => {
            const accs = accounts.filter((a) => p.isToday || legs.has(a.id) || a.createdOn <= p.date);
            const hs: NetWorthHolding[] = [];
            for (const h of holdings) {
              const v = holdingValueOn(h.lots, p.isToday ? '9999-12-31' : p.date);
              if (v !== null) hs.push({ account_id: h.account_id, value: v });
            }
            const ds: NetWorthDebt[] = debts.map((d) => {
              if (p.isToday) return { account_id: d.account_id, balance: d.balance, paid_off: d.paidOffOn !== null };
              if (d.paidOffOn !== null) return { account_id: d.account_id, balance: d.startedBalance ?? d.balance, paid_off: d.paidOffOn <= p.date };
              return { account_id: d.account_id, balance: d.balance, paid_off: false };
            });
            expect(out[i].value).toBe(netWorthOf({ accounts: accs, balances, holdings: hs, debts: ds }));
            expect(out[i].date).toBe(p.date);
          });
        },
      ),
      { numRuns: fcRuns(200), seed: 0x0704 },
    );
  });
});
