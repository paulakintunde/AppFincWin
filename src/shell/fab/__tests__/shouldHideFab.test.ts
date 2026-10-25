import { fabSurface, shouldHideFab, type FabVisibilityInput } from '../shouldHideFab';

const base: FabVisibilityInput = { signedIn: true, surface: 'tabRoot', sheetOpen: false, hideReasons: [], hasAction: true };

describe('shouldHideFab (D-10)', () => {
  it('shows only when every condition is met', () => {
    expect(shouldHideFab(base)).toBe(false);
  });
  it('hides when signed out', () => {
    expect(shouldHideFab({ ...base, signedIn: false })).toBe(true);
  });
  it('hides on an outer screen', () => {
    expect(shouldHideFab({ ...base, surface: 'outer' })).toBe(true);
  });
  it('hides on an unknown surface', () => {
    expect(shouldHideFab({ ...base, surface: 'unknown' })).toBe(true);
  });
  it('hides while a sheet is open', () => {
    expect(shouldHideFab({ ...base, sheetOpen: true })).toBe(true);
  });
  it.each(['bulkSelect', 'entryFlow', 'onboarding', 'stepFlow', 'locked'] as const)('hides for reason %s', (reason) => {
    expect(shouldHideFab({ ...base, hideReasons: [reason] })).toBe(true);
  });
  it('hides when no action is registered', () => {
    expect(shouldHideFab({ ...base, hasAction: false })).toBe(true);
  });
});

describe('fabSurface', () => {
  it('D-85 a null location inside tabs is a tab root', () => {
    expect(fabSurface(null, ['(app)', '(tabs)', 'index'])).toBe('tabRoot');
    expect(fabSurface(null, ['(app)', 'settings'])).toBe('unknown');
    expect(fabSurface(null, [])).toBe('unknown');
  });

  it('maps locations', () => {
    expect(fabSurface(null)).toBe('unknown');
    expect(fabSurface({ area: 'tab' })).toBe('tabRoot');
    expect(fabSurface({ area: 'outer' })).toBe('outer');
  });
});
