import { chooseMonthLayout, compactMonthLabel, formatMonthShort } from '../monthLayout';

describe('chooseMonthLayout (D-55)', () => {
  const base = { arrowsWidth: 104, iconsWidth: 124, gap: 8 };
  it('keeps long name and inline icons when they fit', () => {
    expect(chooseMonthLayout({ ...base, rowWidth: 368, longWidth: 110, shortWidth: 70 })).toEqual({
      name: 'long',
      icons: 'inline',
    });
  });
  it('shortens the name before moving icons', () => {
    expect(chooseMonthLayout({ ...base, rowWidth: 368, longWidth: 140, shortWidth: 80 })).toEqual({
      name: 'short',
      icons: 'inline',
    });
  });
  it('moves icons below on a 320pt row, keeping the long name if it fits', () => {
    expect(chooseMonthLayout({ ...base, rowWidth: 276, longWidth: 110, shortWidth: 70 })).toEqual({
      name: 'long',
      icons: 'below',
    });
  });
  it('moves icons below and shortens at large text', () => {
    expect(chooseMonthLayout({ ...base, rowWidth: 276, longWidth: 200, shortWidth: 150 })).toEqual({
      name: 'short',
      icons: 'below',
    });
  });
  it('defaults when unmeasured', () => {
    expect(chooseMonthLayout({ ...base, rowWidth: 0, longWidth: 110, shortWidth: 70 })).toEqual({
      name: 'long',
      icons: 'inline',
    });
    expect(chooseMonthLayout({ ...base, rowWidth: 368, longWidth: 0, shortWidth: 0 })).toEqual({
      name: 'long',
      icons: 'inline',
    });
  });
  it('treats equality as fitting', () => {
    // inlineRoom = 368 - 104 - 124 - 8 = 132
    expect(chooseMonthLayout({ ...base, rowWidth: 368, longWidth: 132, shortWidth: 70 })).toEqual({
      name: 'long',
      icons: 'inline',
    });
  });
  it('goes below when the short width is unmeasured', () => {
    expect(chooseMonthLayout({ ...base, rowWidth: 368, longWidth: 200, shortWidth: 0 })).toEqual({
      name: 'long',
      icons: 'below',
    });
  });
});

describe('month labels (D-54, D-58)', () => {
  it('formats short months with Intl', () => {
    expect(formatMonthShort('2026-10', 'en-GB')).toBe('Oct 2026');
    expect(formatMonthShort('2026-09', 'en-US')).toBe('Sep 2026');
    expect(formatMonthShort('2026-09', 'en-GB')).toMatch(/^Sept? 2026$/);
  });
  it('compact label omits the current year only', () => {
    expect(compactMonthLabel('2026-10', '2026-09', 'en-GB')).toBe('Oct');
    expect(compactMonthLabel('2025-10', '2026-09', 'en-GB')).toBe('Oct 2025');
  });
});
