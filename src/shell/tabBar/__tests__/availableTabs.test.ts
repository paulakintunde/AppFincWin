import { TAB_ORDER, type TabId } from '../tabs';
import { TAB_AVAILABILITY, availableTabs, isTabAvailable, tabPosition, tabRoutes } from '../availableTabs';

const ALL: Record<TabId, boolean> = { home: true, activity: true, decide: true, grow: true, insights: true };

describe('availableTabs', () => {
  it('ships all five tabs (07-11); Insights is hidden per user by GatedTabBar', () => {
    expect(TAB_AVAILABILITY).toEqual({ home: true, activity: true, decide: true, grow: true, insights: true });
    expect(availableTabs()).toEqual(['home', 'activity', 'decide', 'grow', 'insights']);
    expect(availableTabs({ ...TAB_AVAILABILITY, insights: false })).toEqual(['home', 'activity', 'decide', 'grow']);
  });
  it('returns TAB_ORDER when everything is on', () => {
    expect(availableTabs(ALL)).toEqual([...TAB_ORDER]);
  });
  it('orders by TAB_ORDER regardless of object key order', () => {
    const shuffled = { insights: true, decide: true, activity: false, home: true, grow: false } as Record<TabId, boolean>;
    expect(availableTabs(shuffled)).toEqual(['home', 'decide', 'insights']);
  });
});

describe('isTabAvailable', () => {
  it('defaults to the rollout map', () => {
    expect(isTabAvailable('decide')).toBe(true);
    expect(isTabAvailable('grow')).toBe(true);
    expect(isTabAvailable('home')).toBe(true);
    expect(isTabAvailable('grow', ALL)).toBe(true);
  });
});

describe('tabPosition', () => {
  it('counts only visible tabs', () => {
    expect(tabPosition('activity')).toEqual({ position: 2, total: 5 });
    expect(tabPosition('decide')).toEqual({ position: 3, total: 5 });
    expect(tabPosition('decide', { ...ALL, insights: false })).toEqual({ position: 3, total: 4 });
  });
  it('is null for an unavailable tab', () => {
    expect(tabPosition('insights', { ...ALL, insights: false })).toBeNull();
    expect(tabPosition('insights')).toEqual({ position: 5, total: 5 });
    expect(tabPosition('grow')).toEqual({ position: 4, total: 5 });
  });
});

describe('tabRoutes', () => {
  it('declares only the visible tabs when Grow is on', () => {
    expect(tabRoutes()).toEqual(availableTabs().map((name) => ({ name, hidden: false })));
  });
  it('still declares Grow, hidden, while its tab is switched off', () => {
    const growOff = { ...TAB_AVAILABILITY, grow: false };
    expect(tabRoutes(growOff)).toEqual([
      { name: 'home', hidden: false },
      { name: 'activity', hidden: false },
      { name: 'decide', hidden: false },
      { name: 'insights', hidden: false },
      { name: 'grow', hidden: true },
    ]);
  });
  it('declares Insights (visible, 07-11) so the navigator never remounts for a level change', () => {
    expect(tabRoutes().map((r) => r.name)).toContain('insights');
    expect(tabRoutes().find((r) => r.name === 'insights')?.hidden).toBe(false);
  });
  it('never leaves a gap, so the layout passes Screen children only', () => {
    for (const grow of [true, false]) {
      const routes = tabRoutes({ ...TAB_AVAILABILITY, grow });
      expect(routes.every((r) => r !== null && typeof r === 'object')).toBe(true);
    }
  });
});
