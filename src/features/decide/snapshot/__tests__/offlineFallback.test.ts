// 05.4-33 APP-01 / APP-06: last month's cached reads rolled into this month, and the oldest-fetch records date (D-126).
import { recordsAsOfOf, rollForward } from '../offlineFallback';

const row = (id: string, local_date: string) => ({ id, local_date });
// November's reads: history 2025-11-01..2026-11-30, upcoming from 2026-12-01.
const prevHistory = [row('a', '2025-11-02'), row('b', '2026-10-15'), row('c', '2026-11-29')];
const prevUpcoming = [row('d', '2026-12-05'), row('e', '2027-01-10')];
// December's windows: history 2025-12-01..2026-12-31, upcoming from 2027-01-01.
const DEC = { from: '2025-12-01', to: '2026-12-31', upcomingFrom: '2027-01-01' };

describe('rollForward', () => {
  it('moves last month into this month: old rows out, upcoming rows now in the window move to history', () => {
    const r = rollForward(prevHistory, prevUpcoming, DEC);
    expect(r.history.map((x) => x.id)).toEqual(['b', 'c', 'd']);
    expect(r.upcoming.map((x) => x.id)).toEqual(['e']);
  });

  it('passes the same row objects through, never copies', () => {
    const r = rollForward(prevHistory, prevUpcoming, DEC);
    expect(r.history[0]).toBe(prevHistory[1]);
    expect(r.upcoming[0]).toBe(prevUpcoming[1]);
  });

  it('keeps the window edges inclusive for history and from upcomingFrom on for upcoming', () => {
    const edges = rollForward([row('f', '2025-12-01')], [row('g', '2026-12-31'), row('h', '2027-01-01')], DEC);
    expect(edges.history.map((x) => x.id)).toEqual(['f', 'g']);
    expect(edges.upcoming.map((x) => x.id)).toEqual(['h']);
  });

  it('empty reads give empty windows', () => {
    expect(rollForward([], [], DEC)).toEqual({ history: [], upcoming: [] });
  });
});

describe('recordsAsOfOf (D-126)', () => {
  const NOV_27 = Date.UTC(2026, 10, 27, 12);
  const DEC_1 = Date.UTC(2026, 11, 1, 9);

  it('is the local day of the oldest server fetch', () => {
    expect(recordsAsOfOf([DEC_1, NOV_27, DEC_1], 'UTC')).toBe('2026-11-27');
  });

  it('reads the day in the given time zone', () => {
    // 2026-12-01 03:00 UTC is still 30 November in Los Angeles.
    expect(recordsAsOfOf([Date.UTC(2026, 11, 1, 3)], 'America/Los_Angeles')).toBe('2026-11-30');
  });

  it('is null when any read has no known server fetch, when there are none, or on a bad number', () => {
    expect(recordsAsOfOf([DEC_1, null], 'UTC')).toBeNull();
    expect(recordsAsOfOf([], 'UTC')).toBeNull();
    expect(recordsAsOfOf([Number.NaN], 'UTC')).toBeNull();
  });

  it('is null for a time zone that is not valid', () => {
    expect(recordsAsOfOf([DEC_1], 'Not/AZone')).toBeNull();
  });
});
