import fc from 'fast-check';
import { PDF_MAX_ITEMS } from '../types';
import { parsePdfReadResponse } from '../validate';

const ok = (pages = 1) => ({
  ok: true,
  pageCount: pages,
  pages: Array.from({ length: pages }, (_, i) => ({ n: i + 1, width: 595, height: 842, items: [{ str: 'Date', x: 44.1, y: 700, w: 20 }] })),
});
const onePage = (items: unknown, extra: Record<string, unknown> = {}) => ({
  ok: true,
  pageCount: 1,
  pages: [{ n: 1, width: 1, height: 1, items, ...extra }],
});
const item = (over: Record<string, unknown> = {}) => ({ str: 'a', x: 1, y: 1, w: 1, ...over });

describe('parsePdfReadResponse', () => {
  it('accepts a valid payload as an equal but fresh object', () => {
    const input = ok(2);
    const out = parsePdfReadResponse(input);
    expect(out).toEqual(input);
    expect(out).not.toBe(input);
  });

  it('accepts an empty-items page', () => {
    expect(parsePdfReadResponse(onePage([]))).toEqual(onePage([]));
  });

  it('accepts error responses with and without a page count', () => {
    expect(parsePdfReadResponse({ ok: false, error: 'no-text-layer', pageCount: 1 })).toEqual({ ok: false, error: 'no-text-layer', pageCount: 1 });
    expect(parsePdfReadResponse({ ok: false, error: 'unauthorized' })).toEqual({ ok: false, error: 'unauthorized' });
    expect(parsePdfReadResponse({ ok: false, error: 'too-many-pages', pageCount: 40 })).toEqual({ ok: false, error: 'too-many-pages', pageCount: 40 });
  });

  it.each([
    ['a string', 'ok'],
    ['null', null],
    ['an array', []],
    ['a missing ok flag', { pageCount: 1, pages: [] }],
    ['an unknown error code', { ok: false, error: 'boom' }],
    ['a non-string error', { ok: false, error: 3 }],
    ['a negative error page count', { ok: false, error: 'internal', pageCount: -1 }],
    ['a fractional error page count', { ok: false, error: 'internal', pageCount: 1.5 }],
    ['a page count of 26', { ...ok(1), pageCount: 26 }],
    ['a page count of 0', { ok: true, pageCount: 0, pages: [] }],
    ['a fractional page count', { ...ok(1), pageCount: 1.5 }],
    ['pages that are not an array', { ok: true, pageCount: 1, pages: 'x' }],
    ['a pages length mismatch', { ...ok(1), pageCount: 2 }],
    ['a page that is not an object', { ok: true, pageCount: 1, pages: [3] }],
    ['a bad page number', onePage([], { n: 0 })],
    ['a non-finite width', onePage([], { width: Infinity })],
    ['a non-finite height', onePage([], { height: NaN })],
    ['items that are not an array', onePage({})],
    ['an item that is not an object', onePage(['a'])],
    ['a non-string item', onePage([item({ str: 1 })])],
    ['a non-finite x', onePage([item({ x: Infinity })])],
    ['a non-finite y', onePage([item({ y: NaN })])],
    ['a non-finite w', onePage([item({ w: 'w' })])],
    ['an item of 201 characters', onePage([item({ str: 'a'.repeat(201) })])],
  ])('rejects %s', (_name, input) => {
    expect(parsePdfReadResponse(input)).toBeNull();
  });

  it('accepts an item of exactly 200 characters', () => {
    expect(parsePdfReadResponse(onePage([item({ str: 'a'.repeat(200) })]))).not.toBeNull();
  });

  it('rejects more than PDF_MAX_ITEMS items before looking at them', () => {
    expect(parsePdfReadResponse(onePage(new Array(PDF_MAX_ITEMS + 1).fill(null)))).toBeNull();
  });

  it('never throws on arbitrary JSON', () => {
    fc.assert(
      fc.property(fc.jsonValue(), (v) => {
        expect(() => parsePdfReadResponse(v)).not.toThrow();
      }),
      { numRuns: 300 },
    );
  });
});
