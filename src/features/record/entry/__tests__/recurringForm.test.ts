import { needsScopePrompt, nonTemplatePatch, repeatsToSchedule, templateFieldsChanged, thisAndFuturePlan, repeatsProblem } from '../recurringForm';

describe('repeatsToSchedule', () => {
  it('maps never to null', () => {
    expect(repeatsToSchedule({ freq: 'never' }, '2026-01-01')).toBeNull();
  });

  it('maps an open-ended repeat', () => {
    expect(repeatsToSchedule({ freq: 'monthly', end: { kind: 'never' } }, '2026-01-01')).toEqual({
      freq: 'monthly',
      endDate: null,
      occurrenceCount: null,
    });
  });

  it('maps an end date', () => {
    expect(repeatsToSchedule({ freq: 'weekly', end: { kind: 'date', date: '2027-01-31' } }, '2026-01-01')).toEqual({
      freq: 'weekly',
      endDate: '2027-01-31',
      occurrenceCount: null,
    });
  });

  it('maps an occurrence count', () => {
    expect(repeatsToSchedule({ freq: 'yearly', end: { kind: 'count', count: 12 } }, '2026-01-01')).toEqual({
      freq: 'yearly',
      endDate: null,
      occurrenceCount: 12,
    });
  });

  it('accepts the count bounds 1 and 1000', () => {
    expect(repeatsToSchedule({ freq: 'monthly', end: { kind: 'count', count: 1 } }, '2026-01-01')).not.toBe('invalid');
    expect(repeatsToSchedule({ freq: 'monthly', end: { kind: 'count', count: 1000 } }, '2026-01-01')).not.toBe('invalid');
  });

  it.each([0, -1, 1001, 2.5, Number.NaN])('rejects the count %p', (count) => {
    expect(repeatsToSchedule({ freq: 'monthly', end: { kind: 'count', count } }, '2026-01-01')).toBe('invalid');
  });

  it('rejects an end date that is not a calendar date', () => {
    expect(repeatsToSchedule({ freq: 'monthly', end: { kind: 'date', date: '' } }, '2026-01-01')).toBe('invalid');
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

describe('nonTemplatePatch', () => {
  it('keeps only the note and status keys', () => {
    expect(nonTemplatePatch({ original_amount: -5, note: 'x', status: 'paid', name: 'Rent' })).toEqual({ note: 'x', status: 'paid' });
  });
});

describe('repeatsToSchedule against the anchor date (S-CR-03)', () => {
  const v = (date: string) => ({ freq: 'monthly' as const, end: { kind: 'date' as const, date } });
  it('refuses an end date before the entry date', () => {
    expect(repeatsToSchedule(v('2026-10-07'), '2026-10-20')).toBe('invalid');
    expect(repeatsProblem(v('2026-10-07'), '2026-10-20')).toBe('endBeforeStart');
  });
  it('accepts an end date on or after the entry date', () => {
    expect(repeatsToSchedule(v('2026-10-20'), '2026-10-20')).toMatchObject({ endDate: '2026-10-20' });
    expect(repeatsProblem(v('2026-11-20'), '2026-10-20')).toBeNull();
  });
  it('names a bad count separately', () => {
    expect(repeatsProblem({ freq: 'weekly', end: { kind: 'count', count: 0 } }, '2026-10-20')).toBe('endCountInvalid');
    expect(repeatsProblem({ freq: 'never' }, '2026-10-20')).toBeNull();
  });
});

describe('thisAndFuturePlan (S-CR-02)', () => {
  const occ = { status: 'pending' as const, occurrence_date: '2026-09-20', local_date: '2026-09-20' };

  it('a pending, template-only edit lets the series rewrite the row: one step', () => {
    expect(thisAndFuturePlan(occ, { original_amount: -2000 })).toEqual({ rowPatch: null, effectiveFrom: '2026-09-20' });
  });

  it('a pending edit with a note patches the row in full and starts the series the next day', () => {
    expect(thisAndFuturePlan(occ, { original_amount: -2000, note: 'x' })).toEqual({
      rowPatch: { original_amount: -2000, note: 'x' },
      effectiveFrom: '2026-09-21',
    });
  });

  it.each(['paid', 'skipped'] as const)('a %s occurrence is patched in full; the series starts the next day', (status) => {
    expect(thisAndFuturePlan({ ...occ, status }, { original_amount: -2000 })).toEqual({
      rowPatch: { original_amount: -2000 },
      effectiveFrom: '2026-09-21',
    });
  });

  it('a moved date starts the series after the later of the two dates, across a month end', () => {
    expect(thisAndFuturePlan({ ...occ, status: 'paid' }, { local_date: '2026-09-30' }).effectiveFrom).toBe('2026-10-01');
    expect(thisAndFuturePlan({ ...occ, status: 'paid' }, { local_date: '2026-09-10' }).effectiveFrom).toBe('2026-09-21');
  });

  it('falls back to the local date when the row has no occurrence date', () => {
    expect(thisAndFuturePlan({ status: 'paid', occurrence_date: null, local_date: '2026-12-31' }, { name: 'x' }).effectiveFrom).toBe('2027-01-01');
  });
});
