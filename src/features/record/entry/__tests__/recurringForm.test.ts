import { needsScopePrompt, repeatsToSchedule, templateFieldsChanged } from '../recurringForm';

describe('repeatsToSchedule', () => {
  it('maps never to null', () => {
    expect(repeatsToSchedule({ freq: 'never' })).toBeNull();
  });

  it('maps an open-ended repeat', () => {
    expect(repeatsToSchedule({ freq: 'monthly', end: { kind: 'never' } })).toEqual({
      freq: 'monthly',
      endDate: null,
      occurrenceCount: null,
    });
  });

  it('maps an end date', () => {
    expect(repeatsToSchedule({ freq: 'weekly', end: { kind: 'date', date: '2027-01-31' } })).toEqual({
      freq: 'weekly',
      endDate: '2027-01-31',
      occurrenceCount: null,
    });
  });

  it('maps an occurrence count', () => {
    expect(repeatsToSchedule({ freq: 'yearly', end: { kind: 'count', count: 12 } })).toEqual({
      freq: 'yearly',
      endDate: null,
      occurrenceCount: 12,
    });
  });

  it('accepts the count bounds 1 and 1000', () => {
    expect(repeatsToSchedule({ freq: 'monthly', end: { kind: 'count', count: 1 } })).not.toBe('invalid');
    expect(repeatsToSchedule({ freq: 'monthly', end: { kind: 'count', count: 1000 } })).not.toBe('invalid');
  });

  it.each([0, -1, 1001, 2.5, Number.NaN])('rejects the count %p', (count) => {
    expect(repeatsToSchedule({ freq: 'monthly', end: { kind: 'count', count } })).toBe('invalid');
  });

  it('rejects an end date that is not a calendar date', () => {
    expect(repeatsToSchedule({ freq: 'monthly', end: { kind: 'date', date: '' } })).toBe('invalid');
  });
});

describe('templateFieldsChanged', () => {
  it('is false for note-only and status-only patches', () => {
    expect(templateFieldsChanged({ note: 'x' })).toBe(false);
    expect(templateFieldsChanged({ status: 'paid' })).toBe(false);
  });

  it.each([
    { original_amount: -5 },
    { name: 'Rent' },
    { category_id: 'c' },
    { account_id: 'a' },
    { payment_type: 'card' as const },
    { original_currency: 'EUR' },
    { local_date: '2026-10-01' },
  ])('is true for %p', (patch) => {
    expect(templateFieldsChanged(patch)).toBe(true);
  });
});

describe('needsScopePrompt', () => {
  const inSeries = { recurring_series_id: 's1', status: 'pending' as const };

  it('asks when a template field changes on a series row', () => {
    expect(needsScopePrompt(inSeries, { original_amount: -500 })).toBe(true);
  });

  it('does not ask for note-only edits', () => {
    expect(needsScopePrompt(inSeries, { note: 'hi' })).toBe(false);
  });

  it('does not ask when recording the actual payment of a pending occurrence', () => {
    expect(needsScopePrompt(inSeries, { original_amount: -500, status: 'paid' })).toBe(false);
  });

  it('still asks for a paid occurrence whose amount changes', () => {
    expect(needsScopePrompt({ recurring_series_id: 's1', status: 'paid' }, { original_amount: -500 })).toBe(true);
  });

  it('never asks for a row outside a series', () => {
    expect(needsScopePrompt({ recurring_series_id: null, status: 'paid' }, { original_amount: -500 })).toBe(false);
  });
});
