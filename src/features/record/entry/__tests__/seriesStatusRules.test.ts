import { occurrencesBetween } from '@/engine/recurring';
import { endDateForStop, resumeAllowed, seriesStatusOf, stopDateProblem } from '../seriesStatus';

const live = { end_date: null, anchor_date: '2026-03-10', end_reason: null } as const;

describe('seriesStatusOf', () => {
  it('a live series is live whatever end_reason holds', () => {
    expect(seriesStatusOf(live)).toEqual({ kind: 'live' });
    expect(seriesStatusOf({ ...live, end_reason: 'paused' })).toEqual({ kind: 'live' });
    expect(seriesStatusOf({ end_date: null })).toEqual({ kind: 'live' });
  });

  it('an ended series with end_reason null reads Stopped (plain end or go-ahead)', () => {
    expect(seriesStatusOf({ ...live, end_date: '2026-09-30' })).toEqual({ kind: 'stopped', from: '2026-10-01' });
    expect(seriesStatusOf({ ...live, end_date: '2026-09-30', end_reason: 'stopped' })).toEqual({ kind: 'stopped', from: '2026-10-01' });
  });

  it('an ended series with end_reason paused reads Paused from the day after', () => {
    expect(seriesStatusOf({ ...live, end_date: '2026-12-31', end_reason: 'paused' })).toEqual({ kind: 'paused', from: '2027-01-01' });
  });
});

describe('date rules', () => {
  const today = '2026-10-28';

  it('endDateForStop is the day before', () => {
    expect(endDateForStop(live, '2026-10-01', today)).toBe('2026-09-30');
  });

  it('refuses a date before the start (tooEarly) but allows the start day', () => {
    // 05.2 F-13: stop from the first day
    expect(stopDateProblem(live, '2026-03-10', today)).toBeNull();
    expect(endDateForStop(live, '2026-03-10', today)).toBe('2026-03-09');
    expect(stopDateProblem(live, '2026-03-09', today)).toBe('tooEarly');
    expect(stopDateProblem(live, '2026-03-01', today)).toBe('tooEarly');
    expect(endDateForStop(live, '2026-03-09', today)).toBeNull();
    expect(stopDateProblem(live, '2026-03-11', today)).toBeNull();
  });

  it('a series that started today can be stopped from today', () => {
    const startedToday = { ...live, anchor_date: today };
    expect(stopDateProblem(startedToday, today, today)).toBeNull();
    expect(endDateForStop(startedToday, today, today)).toBe('2026-10-27');
    expect(stopDateProblem(startedToday, '2026-10-27', today)).toBe('tooEarly');
  });

  it('a series stopped from its first day reads stopped from the start day and has no occurrence', () => {
    const row = { anchor_date: '2026-10-28', end_date: '2026-10-27', end_reason: 'stopped' as const };
    expect(seriesStatusOf(row)).toEqual({ kind: 'stopped', from: '2026-10-28' });
    const schedule = { anchorDate: row.anchor_date, freq: 'monthly' as const, endDate: row.end_date, occurrenceCount: null };
    expect(occurrencesBetween(schedule, '2026-01-01', '2028-12-31')).toEqual([]);
  });

  it('a series paused from its first day can be resumed from the start day', () => {
    const row = { anchor_date: '2026-10-28', end_date: '2026-10-27', end_reason: 'paused' as const };
    expect(seriesStatusOf(row)).toEqual({ kind: 'paused', from: '2026-10-28' });
    expect(resumeAllowed(row, '2026-10-28', today)).toBe(true);
    expect(resumeAllowed(row, '2026-10-27', today)).toBe(false);
  });

  it('refuses a date more than 12 months before the current month start (tooOld)', () => {
    const old = { ...live, anchor_date: '2020-01-01' };
    expect(stopDateProblem(old, '2025-10-01', today)).toBeNull();
    expect(stopDateProblem(old, '2025-09-30', today)).toBe('tooOld');
    expect(endDateForStop(old, '2025-09-30', today)).toBeNull();
  });
});

describe('resumeAllowed', () => {
  const today = '2026-10-28';
  const paused = { ...live, end_date: '2026-09-30', end_reason: 'paused' as const };

  it('only for a paused row, after its end date', () => {
    expect(resumeAllowed(paused, '2026-11-05', today)).toBe(true);
    expect(resumeAllowed(paused, '2026-09-30', today)).toBe(false);
    expect(resumeAllowed(live, '2026-11-05', today)).toBe(false);
    expect(resumeAllowed({ ...paused, end_reason: null }, '2026-11-05', today)).toBe(false);
  });

  it('not more than 12 months back', () => {
    const old = { ...paused, anchor_date: '2020-01-01', end_date: '2024-01-31' };
    expect(resumeAllowed(old, '2025-09-30', today)).toBe(false);
    expect(resumeAllowed(old, '2025-10-01', today)).toBe(true);
  });
});
