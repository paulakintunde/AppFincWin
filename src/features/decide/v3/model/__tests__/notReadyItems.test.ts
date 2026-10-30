/**
 * 05.3-57 (D-24, D-29): notReadyGroups turns named readiness items into month groups of plain questions with answer chips.
 * The owner evidence (asOf 2026-10-30) is copied by hand from 05.3-54's readinessItems.test.ts.
 */
import { minorUnits } from '@/engine/money/types';
import type { Readiness, ReadinessItem } from '@/engine/decide/v3';
import { notReadyGroups, notReadyRows } from '../notReady';

const K = 'decide.v3.ui.notReady.';
const TODAY = '2026-10-30';

function item(over: Partial<ReadinessItem>): ReadinessItem {
  return { kind: 'bill', code: 'past_month_missing', month: '2026-09', seriesId: null, envelopeId: null, lineId: null, name: null, amount: null, date: null, ...over };
}

const PAY = item({ kind: 'pay', seriesId: 'pay', lineId: 'pay-sep', name: 'Income', amount: minorUnits(1619942), date: '2026-09-03' });
const NETFLIX = item({ seriesId: 'netflix', lineId: 'netflix-sep', name: 'Netflix', amount: minorUnits(1199), date: '2026-09-03' });
const LUNCH = item({ seriesId: 'lunch', lineId: 'lunch-sep', name: 'Lunch', amount: minorUnits(1000), date: '2026-09-21' });
const SPENDING = item({ kind: 'spending', code: 'activity_not_current', month: '2026-10', date: '2026-10-14' });

function readiness(items: readonly ReadinessItem[], missing: Readiness['missing'] = ['activity_not_current', 'past_month_missing']): Readiness {
  return { ready: false, missing, items, waived: [] };
}

const evidence = readiness([PAY, NETFLIX, LUNCH, SPENDING]);

describe('notReadyGroups', () => {
  it('owner evidence: September (pay, Netflix, Lunch) then October (spending)', () => {
    const groups = notReadyGroups(evidence, '2026-10', TODAY);
    expect(groups.map((g) => [g.key, g.month, g.headingKey])).toEqual([
      ['2026-09', '2026-09', `${K}groupPast`],
      ['2026-10', '2026-10', `${K}groupCurrent`],
    ]);
    expect(groups[0]!.items.map((i) => i.titleParams.name)).toEqual(['Income', 'Netflix', 'Lunch']);
    expect(groups[1]!.items.map((i) => i.item?.kind)).toEqual(['spending']);
  });

  it('a bill with a pending line: It was paid marks that line, It didn’t happen skips it (D-29)', () => {
    const v = notReadyGroups(evidence, '2026-10', TODAY)[0]!.items[1]!;
    expect(v.item).toBe(NETFLIX);
    expect(v.key).toBe('bill|netflix|2026-09-03|2026-09');
    expect(v.titleKey).toBe(`${K}bill.title`);
    expect(v.titleParams).toEqual({ name: 'Netflix', amount: 1199, date: '2026-09-03' });
    expect(v.statusKey).toBe(`${K}bill.pending`);
    expect(v.questionKey).toBe(`${K}bill.question`);
    expect(v.chips.map((c) => [c.labelKey, c.action])).toEqual([
      [`${K}itWasPaid`, { kind: 'markPaid', lineId: 'netflix-sep' }],
      [`${K}someoneElsePaid`, { kind: 'waive', waiver: { kind: 'paid_by_other', seriesId: 'netflix', date: '2026-09-03' } }],
      [`${K}didntHappen`, { kind: 'skip', lineId: 'netflix-sep' }],
    ]);
    expect(v.link).toEqual({ key: 'alwaysOther', labelKey: `${K}alwaysOther`, action: { kind: 'waive', waiver: { kind: 'always_other', seriesId: 'netflix' } } });
  });

  it('pay with a pending line: It arrived, No pay this month skips, elsewhere waives', () => {
    const v = notReadyGroups(evidence, '2026-10', TODAY)[0]!.items[0]!;
    expect(v.titleKey).toBe(`${K}pay.title`);
    expect(v.statusKey).toBe(`${K}pay.pending`);
    expect(v.questionKey).toBe(`${K}pay.question`);
    expect(v.chips.map((c) => [c.labelKey, c.action])).toEqual([
      [`${K}itArrived`, { kind: 'markPaid', lineId: 'pay-sep' }],
      [`${K}noPay`, { kind: 'skip', lineId: 'pay-sep' }],
      [`${K}elsewhere`, { kind: 'waive', waiver: { kind: 'income_elsewhere' } }],
    ]);
    expect(v.link).toBeNull();
  });

  it('no pending line: I’ll record it opens Activity, and the gap answers become waivers', () => {
    const bill = { ...NETFLIX, lineId: null, name: null };
    const pay = { ...PAY, lineId: null, name: null };
    const [b, p] = notReadyGroups(readiness([bill, pay]), '2026-10', TODAY)[0]!.items;
    expect(b!.titleKey).toBe(`${K}bill.titleUnnamed`);
    expect(b!.statusKey).toBe(`${K}bill.none`);
    expect(b!.chips.map((c) => [c.labelKey, c.action])).toEqual([
      [`${K}recordIt`, { kind: 'open', target: 'activity' }],
      [`${K}someoneElsePaid`, { kind: 'waive', waiver: { kind: 'paid_by_other', seriesId: 'netflix', date: '2026-09-03' } }],
      [`${K}didntHappen`, { kind: 'waive', waiver: { kind: 'didnt_happen', seriesId: 'netflix', date: '2026-09-03' } }],
    ]);
    expect(p!.titleKey).toBe(`${K}pay.titleUnnamed`);
    expect(p!.statusKey).toBe(`${K}pay.none`);
    expect(p!.chips.map((c) => [c.labelKey, c.action])).toEqual([
      [`${K}recordIt`, { kind: 'open', target: 'activity' }],
      [`${K}noPay`, { kind: 'waive', waiver: { kind: 'no_pay', seriesId: 'pay', date: '2026-09-03' } }],
      [`${K}elsewhere`, { kind: 'waive', waiver: { kind: 'income_elsewhere' } }],
    ]);
  });

  it('a bill or pay without a series or date offers only I’ll record it', () => {
    const [b, p] = notReadyGroups(readiness([item({ seriesId: null, date: '2026-09-03' }), item({ kind: 'pay', seriesId: 'pay', date: null })]), '2026-10', TODAY)[0]!.items;
    expect(b!.chips.map((c) => c.key)).toEqual(['recordIt']);
    expect(b!.link).toBeNull();
    expect(p!.chips.map((c) => c.key)).toEqual(['recordIt']);
  });

  it('spending: last date, Open Activity, Nothing else to add', () => {
    const v = notReadyGroups(evidence, '2026-10', TODAY)[1]!.items[0]!;
    expect(v.key).toBe('spending||2026-10-14|2026-10');
    expect(v.titleKey).toBe(`${K}spending.title`);
    expect(v.statusKey).toBe(`${K}spending.last`);
    expect(v.titleParams).toEqual({ date: '2026-10-14', month: '2026-10' });
    expect(v.questionKey).toBe(`${K}spending.question`);
    expect(v.chips.map((c) => [c.labelKey, c.action])).toEqual([
      [`${K}openActivity`, { kind: 'open', target: 'activity' }],
      [`${K}nothingToAdd`, { kind: 'waive', waiver: { kind: 'nothing_to_add', month: '2026-10', at: TODAY } }],
    ]);
    const none = notReadyGroups(readiness([{ ...SPENDING, date: null }]), '2026-10', TODAY)[0]!.items[0]!;
    expect(none.statusKey).toBe(`${K}spending.none`);
    expect(none.key).toBe('spending|||2026-10');
  });

  it('month links: past is complete, current is up to date', () => {
    const [sep, oct] = notReadyGroups(evidence, '2026-10', TODAY);
    expect(sep!.monthLink).toEqual({
      key: 'monthCompletePast',
      labelKey: `${K}monthCompletePast`,
      labelParams: { month: '2026-09' },
      action: { kind: 'waive', waiver: { kind: 'month_complete', month: '2026-09', at: TODAY } },
    });
    expect(oct!.monthLink).toEqual({
      key: 'monthCompleteCurrent',
      labelKey: `${K}monthCompleteCurrent`,
      labelParams: { month: '2026-10' },
      action: { kind: 'waive', waiver: { kind: 'month_complete', month: '2026-10', at: TODAY } },
    });
  });

  it('late start: dated or not (W5), Start Decide from this month, Open Activity', () => {
    const late = item({ kind: 'late_start', date: '2026-09-18' });
    const v = notReadyGroups(readiness([late]), '2026-10', TODAY)[0]!.items[0]!;
    expect(v.titleKey).toBe(`${K}lateStart.title`);
    expect(v.titleParams).toEqual({ month: '2026-09', date: '2026-09-18' });
    expect(v.statusKey).toBe(`${K}lateStart.status`);
    expect(v.questionKey).toBe(`${K}lateStart.question`);
    expect(v.chips.map((c) => [c.labelKey, c.labelParams, c.action])).toEqual([
      [`${K}startFrom`, { month: '2026-10' }, { kind: 'waive', waiver: { kind: 'start_from', month: '2026-10' } }],
      [`${K}openActivity`, undefined, { kind: 'open', target: 'activity' }],
    ]);
    const undated = notReadyGroups(readiness([{ ...late, date: null }]), '2026-10', TODAY)[0]!.items[0]!;
    expect(undated.titleKey).toBe(`${K}lateStart.titleNone`);
    expect(undated.titleParams).toEqual({ month: '2026-09' });
  });

  it('envelopes: one merged item, names up to three and the rest as a count, Open envelopes only', () => {
    const env = (id: string, name: string | null): ReadinessItem => item({ kind: 'envelopes', code: 'envelopes_unconfirmed', month: '2026-10', envelopeId: id, name });
    const two = notReadyGroups(readiness([env('h', 'Holiday'), env('c', 'Car')], ['envelopes_unconfirmed']), '2026-10', TODAY);
    expect(two.map((g) => [g.key, g.month, g.headingKey, g.monthLink])).toEqual([['envelopes', null, `${K}groupEnvelopes`, null]]);
    const v = two[0]!.items[0]!;
    expect(v.key).toBe('envelopes');
    expect(v.item).toBeNull();
    expect(v.titleKey).toBe(`${K}envelopes.title`);
    expect(v.titleParams).toEqual({ names: ['Holiday', 'Car'] });
    expect(v.statusKey).toBe(`${K}envelopes.status`);
    expect(v.questionKey).toBeNull();
    expect(v.chips.map((c) => [c.labelKey, c.action])).toEqual([[`${K}openEnvelopes`, { kind: 'open', target: 'envelopes' }]]);
    expect(v.link).toBeNull();

    const five = ['Holiday', 'Car', 'Rent', 'Gifts', 'Pets'].map((n) => env(n, n));
    const more = notReadyGroups(readiness([SPENDING, ...five]), '2026-10', TODAY);
    expect(more.map((g) => g.key)).toEqual(['2026-10', 'envelopes']);
    expect(more[1]!.items[0]!.titleKey).toBe(`${K}envelopes.titleMore`);
    expect(more[1]!.items[0]!.titleParams).toEqual({ names: ['Holiday', 'Car', 'Rent'], more: 2 });

    // An unnamed envelope counts in "more"; with no names at all the title falls back to the code-only title.
    expect(notReadyGroups(readiness([env('a', 'Car'), env('b', null)]), '2026-10', TODAY)[0]!.items[0]!.titleParams).toEqual({ names: ['Car'], more: 1 });
    const unnamed = notReadyGroups(readiness([env('a', null)]), '2026-10', TODAY)[0]!.items[0]!;
    expect(unnamed.titleKey).toBe(`${K}envelopes_unconfirmed`);
    expect(unnamed.titleParams).toEqual({});
  });

  it('groups months in order, oldest first, whatever the item order', () => {
    const aug = { ...NETFLIX, month: '2026-08', date: '2026-08-03' };
    expect(notReadyGroups(readiness([SPENDING, NETFLIX, aug]), '2026-10', TODAY).map((g) => g.key)).toEqual(['2026-08', '2026-09', '2026-10']);
  });

  it('a Readiness without items gives code-only groups that match notReadyRows', () => {
    const r: Readiness = { ready: false, missing: ['activity_not_current', 'envelopes_unconfirmed', 'past_month_missing'] };
    const groups = notReadyGroups(r, '2026-10', TODAY);
    const rows = notReadyRows(r, '2026-10');
    expect(groups.map((g) => [g.key, g.month, g.monthLink])).toEqual([
      ['2026-09', '2026-09', null],
      ['2026-10', '2026-10', null],
      ['envelopes', null, null],
    ]);
    groups.forEach((g, i) => {
      const row = rows[i]!;
      expect(g.items).toEqual([
        {
          key: row.code,
          item: null,
          titleKey: row.titleKey,
          titleParams: row.month === null ? {} : { month: row.month },
          statusKey: row.reasonKey,
          questionKey: null,
          chips: [{ key: row.target === 'envelopes' ? 'openEnvelopes' : 'openActivity', labelKey: row.buttonKey, action: { kind: 'open', target: row.target } }],
          link: null,
        },
      ]);
    });
    expect(notReadyGroups({ ...r, items: [] }, '2026-10', TODAY)).toEqual(groups);
  });

  it('ready, empty or undefined gives no groups', () => {
    expect(notReadyGroups({ ready: true, missing: [], items: [], waived: [] }, '2026-10', TODAY)).toEqual([]);
    expect(notReadyGroups({ ready: false, missing: [] }, '2026-10', TODAY)).toEqual([]);
    expect(notReadyGroups(undefined, '2026-10', TODAY)).toEqual([]);
  });
});
