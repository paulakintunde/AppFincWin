import { isAuthorized, safeEqual } from './auth';

describe('safeEqual', () => {
  it('true for equal strings', () => expect(safeEqual('abc', 'abc')).toBe(true));
  it('false for different lengths', () => expect(safeEqual('abc', 'abcd')).toBe(false));
  it('false for one differing char', () => expect(safeEqual('abc', 'abd')).toBe(false));
});

describe('isAuthorized', () => {
  const env = (v?: string) => (n: string) => (n === 'STATEMENT_PURGE_SECRET' ? v : undefined);
  const hdr = (v: string | null) => (n: string) => (n === 'x-statement-purge-secret' ? v : null);
  it('false when env missing', () => expect(isAuthorized(env(undefined), hdr('s'))).toBe(false));
  it('false when header missing', () => expect(isAuthorized(env('s'), hdr(null))).toBe(false));
  it('false when wrong', () => expect(isAuthorized(env('s'), hdr('x'))).toBe(false));
  it('true when equal', () => expect(isAuthorized(env('s'), hdr('s'))).toBe(true));
});
