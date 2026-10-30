import { READINESS_KEYS } from '@/engine/decide/v3';
import { NOT_READY_ORDER, notReadyRows } from '../notReady';

describe('notReadyRows', () => {
  it('reorders an alphabetical engine list (D-06)', () => {
    expect([...NOT_READY_ORDER]).toEqual(['past_month_missing', 'activity_not_current', 'envelopes_unconfirmed']);
    const rows = notReadyRows({ ready: false, missing: ['activity_not_current', 'envelopes_unconfirmed', 'past_month_missing'] }, '2026-10');
    expect(rows.map((r) => r.code)).toEqual([...NOT_READY_ORDER]);
    expect(rows.map((r) => r.month)).toEqual(['2026-09', '2026-10', null]);
    expect(rows.map((r) => r.buttonKey)).toEqual(['decide.v3.ui.notReady.openActivity', 'decide.v3.ui.notReady.openActivity', 'decide.v3.ui.notReady.openEnvelopes']);
    expect(rows.map((r) => r.target)).toEqual(['activity', 'activity', 'envelopes']);
    expect(rows[1]!.titleKey).toBe('decide.v3.ui.notReady.activity_not_current');
    expect(rows[0]!.reasonKey).toBe(READINESS_KEYS.past_month_missing);
  });
  it('subsets, ready and undefined', () => {
    expect(notReadyRows({ ready: false, missing: ['envelopes_unconfirmed'] }, '2026-10').map((r) => r.code)).toEqual(['envelopes_unconfirmed']);
    expect(notReadyRows({ ready: true, missing: [] }, '2026-10')).toEqual([]);
    expect(notReadyRows({ ready: false, missing: [] }, '2026-10')).toEqual([]);
    expect(notReadyRows(undefined, '2026-10')).toEqual([]);
  });
  it('January looks back to December', () => {
    expect(notReadyRows({ ready: false, missing: ['past_month_missing'] }, '2026-01')[0]!.month).toBe('2025-12');
  });
});
