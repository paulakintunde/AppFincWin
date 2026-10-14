import {
  MAX_HISTORY,
  applyTransition,
  classifyTransition,
  decideBack,
  popTo,
  pushEntry,
  sameLocation,
  type Location,
} from '../backHistoryReducer';

const tab = (t: string): Location => ({ area: 'tab', tab: t, href: `/${t}` });
const outer = (depth: number, href: string): Location => ({ area: 'outer', depth, href });

describe('D-05 sameLocation', () => {
  it('tab locations are equal when the tab matches', () => {
    expect(sameLocation(tab('home'), { area: 'tab', tab: 'home', href: '/other' })).toBe(true);
    expect(sameLocation(tab('home'), tab('activity'))).toBe(false);
  });
  it('outer locations are equal when depth and href match', () => {
    expect(sameLocation(outer(1, '/a'), outer(1, '/a'))).toBe(true);
    expect(sameLocation(outer(1, '/a'), outer(2, '/a'))).toBe(false);
    expect(sameLocation(outer(1, '/a'), outer(1, '/b'))).toBe(false);
  });
  it('a tab never equals an outer', () => {
    expect(sameLocation(tab('home'), outer(1, '/home'))).toBe(false);
    expect(sameLocation(outer(1, '/home'), tab('home'))).toBe(false);
  });
});

describe('D-05 pushEntry', () => {
  it('appends without mutating', () => {
    const h: Location[] = [tab('home')];
    const out = pushEntry(h, tab('activity'));
    expect(out).toEqual([tab('home'), tab('activity')]);
    expect(h).toHaveLength(1);
  });
  it('keeps only the last 8', () => {
    let h: Location[] = [];
    for (let i = 1; i <= 9; i++) h = pushEntry(h, outer(1, `/e${i}`));
    expect(MAX_HISTORY).toBe(8);
    expect(h).toHaveLength(8);
    expect(h[0]).toEqual(outer(1, '/e2'));
    expect(h[7]).toEqual(outer(1, '/e9'));
  });
  it('is a no-op when the entry equals the current last', () => {
    const h: Location[] = [tab('home')];
    expect(pushEntry(h, tab('home'))).toEqual(h);
  });
});

describe('popTo', () => {
  it('truncates to before the LAST matching occurrence', () => {
    const h = [tab('home'), tab('activity'), tab('home'), tab('activity')];
    expect(popTo(h, tab('home'))).toEqual([tab('home'), tab('activity')]);
  });
  it('leaves history unchanged without a match', () => {
    const h = [tab('home')];
    expect(popTo(h, tab('activity'))).toEqual(h);
  });
});

describe('classifyTransition', () => {
  it('identical -> none', () => {
    expect(classifyTransition(outer(1, '/a'), outer(1, '/a'), false)).toBe('none');
  });
  it('tab -> outer is push, outer -> tab is pop', () => {
    expect(classifyTransition(tab('home'), outer(1, '/a'), false)).toBe('push');
    expect(classifyTransition(outer(1, '/a'), tab('home'), false)).toBe('pop');
  });
  it('outer -> outer by depth', () => {
    expect(classifyTransition(outer(2, '/b'), outer(1, '/a'), false)).toBe('pop');
    expect(classifyTransition(outer(1, '/a'), outer(2, '/b'), false)).toBe('push');
  });
  it('outer -> outer same depth, different href follows pendingBack', () => {
    expect(classifyTransition(outer(1, '/a'), outer(1, '/b'), true)).toBe('pop');
    expect(classifyTransition(outer(1, '/a'), outer(1, '/b'), false)).toBe('push');
  });
  it('tab -> tab', () => {
    expect(classifyTransition(tab('home'), { area: 'tab', tab: 'home', href: '/x' }, false)).toBe('none');
    expect(classifyTransition(tab('home'), tab('activity'), true)).toBe('pop');
    expect(classifyTransition(tab('home'), tab('activity'), false)).toBe('push');
  });
});

describe('applyTransition', () => {
  it('prev null leaves history unchanged', () => {
    const h = [tab('home')];
    expect(applyTransition(h, null, tab('activity'), false)).toBe(h);
  });
  it('none returns the same reference', () => {
    const h = [tab('home')];
    expect(applyTransition(h, tab('home'), tab('home'), false)).toBe(h);
  });
  it('push stores prev', () => {
    expect(applyTransition([], tab('home'), tab('activity'), false)).toEqual([tab('home')]);
  });
  it('pop with a match truncates', () => {
    const h = [tab('home'), tab('activity')];
    expect(applyTransition(h, outer(1, '/a'), tab('activity'), false)).toEqual([tab('home')]);
  });
  it('pop with no match: pendingBack drops the last entry', () => {
    const h = [tab('home'), tab('decide')];
    expect(applyTransition(h, tab('grow'), tab('activity'), true)).toEqual([tab('home')]);
  });
  it('pop with no match and not pendingBack leaves history unchanged', () => {
    const h = [tab('home')];
    expect(applyTransition(h, outer(1, '/you'), tab('activity'), false)).toEqual(h);
  });
});

describe('decideBack', () => {
  it('null current exits', () => {
    expect(decideBack(null, [], 'home')).toEqual({ type: 'exit' });
  });
  it('outer current is stackBack', () => {
    expect(decideBack(outer(1, '/a'), [tab('home')], 'home')).toEqual({ type: 'stackBack' });
  });
  it('tab current, top is a different tab -> switchTab', () => {
    expect(decideBack(tab('activity'), [tab('home')], 'home')).toEqual({ type: 'switchTab', tab: 'home' });
  });
  it('tab current, top is the same tab or an outer entry -> discardEntry', () => {
    expect(decideBack(tab('home'), [tab('home')], 'home')).toEqual({ type: 'discardEntry' });
    expect(decideBack(tab('home'), [outer(1, '/a')], 'home')).toEqual({ type: 'discardEntry' });
  });
  it('D-06 empty history: non-home switches to home, home exits', () => {
    expect(decideBack(tab('activity'), [], 'home')).toEqual({ type: 'switchTab', tab: 'home' });
    expect(decideBack(tab('home'), [], 'home')).toEqual({ type: 'exit' });
  });
});

describe('D-05 / D-22 scenarios', () => {
  it('detail push then observed pop', () => {
    let h: Location[] = [];
    h = applyTransition(h, tab('home'), outer(1, '/accounts/a1'), false);
    expect(h).toEqual([tab('home')]);
    expect(decideBack(outer(1, '/accounts/a1'), h, 'home')).toEqual({ type: 'stackBack' });
    h = applyTransition(h, outer(1, '/accounts/a1'), tab('home'), true);
    expect(h).toEqual([]);
  });
  it('home -> activity -> history -> back chain ends in exit', () => {
    let h: Location[] = [];
    h = applyTransition(h, tab('home'), tab('activity'), false);
    h = applyTransition(h, tab('activity'), outer(1, '/history'), false);
    expect(h).toEqual([tab('home'), tab('activity')]);
    h = applyTransition(h, outer(1, '/history'), tab('activity'), true);
    expect(h).toEqual([tab('home')]);
    expect(decideBack(tab('activity'), h, 'home')).toEqual({ type: 'switchTab', tab: 'home' });
    h = applyTransition(h, tab('activity'), tab('home'), true);
    expect(h).toEqual([]);
    expect(decideBack(tab('home'), h, 'home')).toEqual({ type: 'exit' });
  });
  it('D-22 programmatic dismissal keeps history and back goes home', () => {
    let h: Location[] = [];
    h = applyTransition(h, tab('home'), outer(1, '/you'), false);
    h = applyTransition(h, outer(1, '/you'), tab('activity'), false);
    expect(h).toEqual([tab('home')]);
    expect(decideBack(tab('activity'), h, 'home')).toEqual({ type: 'switchTab', tab: 'home' });
  });
  it('cap: 10 alternating tab switches leave exactly 8 entries', () => {
    let h: Location[] = [];
    let cur = tab('home');
    for (let i = 0; i < 10; i++) {
      const next = tab(i % 2 === 0 ? 'activity' : 'home');
      h = applyTransition(h, cur, next, false);
      cur = next;
    }
    expect(h).toHaveLength(8);
  });
});
