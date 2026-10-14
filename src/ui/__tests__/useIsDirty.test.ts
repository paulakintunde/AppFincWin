import { renderHook } from '@testing-library/react-native';
import { isStructurallyEqual, useIsDirty } from '../useIsDirty';

describe('isStructurallyEqual', () => {
  it('compares primitives by ===', () => {
    expect(isStructurallyEqual(1, 1)).toBe(true);
    expect(isStructurallyEqual('a', 'b')).toBe(false);
    expect(isStructurallyEqual(1, '1')).toBe(false);
  });
  it('treats null and undefined as different', () => {
    expect(isStructurallyEqual(null, undefined)).toBe(false);
    expect(isStructurallyEqual(null, null)).toBe(true);
    expect(isStructurallyEqual({}, null)).toBe(false);
    expect(isStructurallyEqual(null, {})).toBe(false);
  });
  it('compares arrays deeply', () => {
    expect(isStructurallyEqual([1, [2]], [1, [2]])).toBe(true);
    expect(isStructurallyEqual([1, 2], [1, 3])).toBe(false);
    expect(isStructurallyEqual([1], [1, 2])).toBe(false);
    expect(isStructurallyEqual([], {})).toBe(false);
    expect(isStructurallyEqual({}, [])).toBe(false);
  });
  it('compares objects deeply, ignoring key order', () => {
    expect(isStructurallyEqual({ a: 1, b: { c: 2 } }, { b: { c: 2 }, a: 1 })).toBe(true);
    expect(isStructurallyEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
    expect(isStructurallyEqual({ a: undefined }, { b: undefined })).toBe(false);
    expect(isStructurallyEqual({ a: { c: 1 } }, { a: { c: 2 } })).toBe(false);
  });
});

describe('useIsDirty', () => {
  it('is false for identical values and true once a nested field differs', async () => {
    const initial = { a: 1, n: { b: 'x' } };
    const hook = await renderHook(({ cur }: { cur: typeof initial }) => useIsDirty(initial, cur), {
      initialProps: { cur: { a: 1, n: { b: 'x' } } },
    });
    expect(hook.result.current).toBe(false);
    await hook.rerender({ cur: { a: 1, n: { b: 'y' } } });
    expect(hook.result.current).toBe(true);
    await hook.rerender({ cur: { a: 1, n: { b: 'x' } } });
    expect(hook.result.current).toBe(false);
  });
});
