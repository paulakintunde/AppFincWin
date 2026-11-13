// 06.1-64 (H-3, FQ2): goDecideHome never pushes or replaces '/decide'; backToCaller pops to the answer below or falls back.
import type { Href } from 'expo-router';
import { FROM_ANSWER, backToCaller, goDecideHome, isFromAnswer, withFromAnswer } from '../decideNav';

function fakeRouter(canGoBack: boolean) {
  return { back: jest.fn(), canGoBack: jest.fn(() => canGoBack), dismissTo: jest.fn() };
}

describe('decideNav', () => {
  it('goDecideHome dismisses to Decide home, with the field focused for a new check', () => {
    const r = fakeRouter(true);
    goDecideHome(r);
    goDecideHome(r, { focusCheck: true });
    goDecideHome(r, { focusCheck: false });
    expect(r.dismissTo.mock.calls).toEqual([['/decide'], ['/decide?focus=check'], ['/decide']]);
    expect(r.back).not.toHaveBeenCalled();
  });

  it('backToCaller goes back when there is a screen below', () => {
    const r = fakeRouter(true);
    const fallback = jest.fn();
    backToCaller(r, fallback);
    expect(r.back).toHaveBeenCalledTimes(1);
    expect(fallback).not.toHaveBeenCalled();
  });

  it('backToCaller runs the fallback with nothing below (DN-3: never leaves the app)', () => {
    const r = fakeRouter(false);
    backToCaller(r, () => goDecideHome(r));
    expect(r.back).not.toHaveBeenCalled();
    expect(r.dismissTo).toHaveBeenCalledWith('/decide');
  });

  it('isFromAnswer reads the from param', () => {
    expect(FROM_ANSWER).toBe('answer');
    expect(isFromAnswer('answer')).toBe(true);
    expect(isFromAnswer(['answer', 'x'])).toBe(true);
    expect(isFromAnswer('home')).toBe(false);
    expect(isFromAnswer(undefined)).toBe(false);
    expect(isFromAnswer([])).toBe(false);
  });

  it('withFromAnswer adds from=answer to an object or string href', () => {
    expect(withFromAnswer({ pathname: '/decide/check/price', params: { id: 'a', dir: 'back' } } as unknown as Href)).toEqual({
      pathname: '/decide/check/price',
      params: { id: 'a', dir: 'back', from: 'answer' },
    });
    expect(withFromAnswer({ pathname: '/decide/check/kind' } as unknown as Href)).toEqual({ pathname: '/decide/check/kind', params: { from: 'answer' } });
    expect(withFromAnswer('/decide/check/kind' as Href)).toBe('/decide/check/kind?from=answer');
    expect(withFromAnswer('/decide/check/kind?id=a' as Href)).toBe('/decide/check/kind?id=a&from=answer');
  });
});
