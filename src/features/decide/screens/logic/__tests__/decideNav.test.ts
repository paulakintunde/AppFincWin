// 06.1-64 (H-3, FQ2): goDecideHome never pushes or replaces '/decide'; backToCaller pops to the answer below or falls back.
import type { Href } from 'expo-router';
import { parseReturnTo } from '../../setup/safeReturnTo';
import { FROM_ANSWER, backToCaller, goDecideHome, isFromAnswer, returnFromQuickEstimates, withFromAnswer } from '../decideNav';

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

  describe('returnFromQuickEstimates (CN-5 b)', () => {
    const ANSWER = '/decide/answer/0b2f3c4d-1111-2222-3333-444455556666';

    it('opened from an answer: back to that answer below, never a second copy', () => {
      const r = fakeRouter(true);
      returnFromQuickEstimates(r, ANSWER);
      expect(r.back).toHaveBeenCalledTimes(1);
      expect(r.dismissTo).not.toHaveBeenCalled();
    });

    it('opened from an answer with nothing below: dismissTo that answer', () => {
      const r = fakeRouter(false);
      returnFromQuickEstimates(r, [ANSWER]);
      expect(r.dismissTo).toHaveBeenCalledWith(ANSWER);
    });

    it('no return path, or one outside the allowlist: Decide home', () => {
      const r = fakeRouter(true);
      returnFromQuickEstimates(r, undefined);
      returnFromQuickEstimates(r, 'https://evil.example/decide/answer/x');
      expect(r.dismissTo.mock.calls).toEqual([['/decide'], ['/decide']]);
      expect(r.back).not.toHaveBeenCalled();
    });

    it('the onboarding import step: dismissTo it', () => {
      const r = fakeRouter(true);
      returnFromQuickEstimates(r, '/setup/history?accountId=acc-1');
      expect(r.dismissTo).toHaveBeenCalledWith('/setup/history?accountId=acc-1');
      expect(r.back).not.toHaveBeenCalled();
    });
  });

  it('parseReturnTo marks only an allowed answer path as an answer (T-06.1-64-01)', () => {
    expect(parseReturnTo('/decide/answer/abc-1')).toEqual({ path: '/decide/answer/abc-1', kind: 'answer' });
    expect(parseReturnTo('/decide/answer/abc/extra')).toEqual({ path: '/decide/answer/abc/extra', kind: 'other' });
    expect(parseReturnTo('/decide/check/price')).toEqual({ path: '/decide/check/price', kind: 'other' });
    expect(parseReturnTo('//evil/decide/answer/x')).toEqual({ path: '/decide', kind: 'other' });
  });
});
