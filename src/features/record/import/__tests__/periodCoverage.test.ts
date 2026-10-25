import { periodFullyImported } from '../periodCoverage';

const row = (localDate: string | null, included = true, duplicate = false) => ({ localDate, included, duplicate });

describe('periodFullyImported (CR-D02)', () => {
  it('is true when every line inside the period is imported', () => {
    expect(periodFullyImported([row('2026-08-01'), row('2026-08-31')], '2026-08-01', '2026-08-31')).toBe(true);
  });

  it('is false when a line inside the period was unticked', () => {
    expect(periodFullyImported([row('2026-08-01'), row('2026-08-15', false)], '2026-08-01', '2026-08-31')).toBe(false);
  });

  it('ignores unticked lines outside the period and lines with no date', () => {
    expect(
      periodFullyImported([row('2026-07-31', false), row('2026-09-01', false), row(null, false), row('2026-08-02')], '2026-08-01', '2026-08-31'),
    ).toBe(true);
  });

  it('a line left out as a duplicate of a stored line is already in the app', () => {
    expect(periodFullyImported([row('2026-08-10', false, true)], '2026-08-01', '2026-08-31')).toBe(true);
  });
});
