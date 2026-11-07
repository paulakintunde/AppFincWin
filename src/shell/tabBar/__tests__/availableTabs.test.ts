import { TAB_ORDER, type TabId } from '../tabs';
import { TAB_AVAILABILITY, availableTabs, isTabAvailable, tabPosition } from '../availableTabs';

const ALL: Record<TabId, boolean> = { home: true, activity: true, decide: true, grow: true, insights: true };

describe('availableTabs', () => {
  it('ships Home, Activity, Decide and Grow until later phases flip their tabs on', () => {
    expect(TAB_AVAILABILITY).toEqual({ home: true, activity: true, decide: true, grow: true, insights: false });
    expect(availableTabs()).toEqual(['home', 'activity', 'decide', 'grow']);
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
    expect(tabPosition('activity')).toEqual({ position: 2, total: 4 });
    expect(tabPosition('decide')).toEqual({ position: 3, total: 4 });
    expect(tabPosition('decide', ALL)).toEqual({ position: 3, total: 5 });
  });
  it('is null for an unavailable tab', () => {
    expect(tabPosition('insights')).toBeNull();
    expect(tabPosition('grow')).toEqual({ position: 4, total: 4 });
  });
});
