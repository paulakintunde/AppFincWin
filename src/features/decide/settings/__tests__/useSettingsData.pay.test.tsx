/** N-03: the pay Decide settings shows is the current one; a stopped or paused pay is labelled, never shown as current. */
jest.mock('@/data/queries/accounts', () => ({ useAccounts: jest.fn() }));
jest.mock('@/data/queries/decide', () => ({ useDecideSettings: jest.fn() }));
jest.mock('@/data/queries/decideV3', () => ({ useDecideV3: jest.fn() }));
jest.mock('@/data/queries/recurringSeries', () => ({ useRecurringSeries: jest.fn() }));
jest.mock('@/features/record/useRecordContext', () => ({ useRecordContext: jest.fn() }));
jest.mock('../../setup/steps/EverydayStep', () => ({ recordsTypical: jest.fn() }));
jest.mock('../../setup/useSetupFacts', () => ({ useSetupFacts: jest.fn() }));

import { pickRegularPay } from '../useSettingsData';
import type { RecurringSeriesRow } from '@/db/rows';

const row = (over: Partial<RecurringSeriesRow>): RecurringSeriesRow =>
  ({ id: 's', deleted_at: null, income_kind: 'salary', amount: 300000, currency: 'GBP', freq: 'monthly', anchor_date: '2026-01-01', end_date: null, end_reason: null, occurrence_count: null, ...over }) as RecurringSeriesRow;

const TODAY = '2026-10-29';

describe('pickRegularPay', () => {
  it('prefers the live series even when a stopped one comes first', () => {
    const picked = pickRegularPay([row({ id: 'old', end_date: '2026-10-01' }), row({ id: 'new' })], TODAY);
    expect(picked?.id).toBe('new');
    expect(picked?.status).toBe('live');
  });

  it('keeps a series stopped from a future date current until then', () => {
    const picked = pickRegularPay([row({ end_date: '2026-12-31' })], TODAY);
    expect(picked?.status).toBe('live');
    expect(picked?.end_date).toBe('2026-12-31');
  });

  it('reports a stopped-only pay as stopped from the day after its end date', () => {
    const picked = pickRegularPay([row({ end_date: '2026-10-01' })], TODAY);
    expect(picked).toMatchObject({ status: 'stopped', from: '2026-10-02' });
  });

  it('reports a paused-only pay as paused', () => {
    const picked = pickRegularPay([row({ end_date: '2026-10-01', end_reason: 'paused' })], TODAY);
    expect(picked).toMatchObject({ status: 'paused', from: '2026-10-02' });
  });

  it('takes the latest-ended one when none is current', () => {
    const picked = pickRegularPay([row({ id: 'a', end_date: '2026-03-01' }), row({ id: 'b', end_date: '2026-09-01' })], TODAY);
    expect(picked?.id).toBe('b');
  });

  it('returns undefined for no series', () => {
    expect(pickRegularPay([], TODAY)).toBeUndefined();
  });
});
