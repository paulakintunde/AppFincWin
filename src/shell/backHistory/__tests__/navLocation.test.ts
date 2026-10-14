import { OUTER_GROUP, TABS_GROUP, locationFromNavState, type NavStateLike } from '../navLocation';

const root = (outer: NavStateLike | undefined): NavStateLike => ({
  index: 0,
  routes: [{ name: OUTER_GROUP, state: outer }],
});
const tabsState = (focus: string): NavStateLike => ({
  index: 1,
  routes: [{ name: 'home' }, { name: focus }],
});

describe('D-05 locationFromNavState', () => {
  it('returns null for missing state, no (app) route, or (app) without state', () => {
    expect(locationFromNavState(undefined, '/x')).toBeNull();
    expect(locationFromNavState(null, '/x')).toBeNull();
    expect(locationFromNavState({ index: 0, routes: [{ name: 'welcome' }] }, '/x')).toBeNull();
    expect(locationFromNavState(root(undefined), '/x')).toBeNull();
  });

  it('returns null for empty routes', () => {
    expect(locationFromNavState({ routes: [] }, '/x')).toBeNull();
    expect(locationFromNavState(root({ routes: [] }), '/x')).toBeNull();
    expect(
      locationFromNavState(root({ index: 0, routes: [{ name: TABS_GROUP, state: { routes: [] } }] }), '/x'),
    ).toBeNull();
  });

  it('tab focus resolves to a tab location', () => {
    const s = root({ index: 0, routes: [{ name: TABS_GROUP, state: tabsState('activity') }] });
    expect(locationFromNavState(s, '/activity')).toEqual({ area: 'tab', tab: 'activity', href: '/activity' });
  });

  it('null when the tabs navigator has not rendered yet', () => {
    expect(locationFromNavState(root({ index: 0, routes: [{ name: TABS_GROUP }] }), '/')).toBeNull();
  });

  it('outer detail resolves to an outer location with depth', () => {
    const s = root({
      index: 1,
      routes: [{ name: TABS_GROUP, state: tabsState('home') }, { name: 'accounts/[id]' }],
    });
    expect(locationFromNavState(s, '/accounts/a1')).toEqual({ area: 'outer', depth: 1, href: '/accounts/a1' });
  });

  it('absent index is treated as the last route', () => {
    const s = root({ routes: [{ name: TABS_GROUP, state: tabsState('home') }, { name: 'you' }] });
    expect(locationFromNavState(s, '/you')).toEqual({ area: 'outer', depth: 1, href: '/you' });
    const t = root({ routes: [{ name: TABS_GROUP, state: { routes: [{ name: 'home' }, { name: 'activity' }] } }] });
    expect(locationFromNavState(t, '/a')).toEqual({ area: 'tab', tab: 'activity', href: '/a' });
  });

  it('finds (app) when it is not the first root route', () => {
    const s: NavStateLike = {
      index: 1,
      routes: [
        { name: 'welcome' },
        { name: OUTER_GROUP, state: { index: 0, routes: [{ name: TABS_GROUP, state: tabsState('home') }] } },
      ],
    };
    expect(locationFromNavState(s, '/')).toEqual({ area: 'tab', tab: 'home', href: '/' });
  });
});
