import type { ExtraLine } from '@/engine/statement';
import { buildReviewItems, EXTRAS_PAGE } from '../reconcileView';
import type { PreviewRow } from '../importPipeline';

const row = (index: number, duplicate: unknown = null): PreviewRow => ({ index, duplicate }) as unknown as PreviewRow;
const extra = (n: number): ExtraLine => ({ id: `e${n}`, localDate: '2026-03-01', amount: -100, name: null, nearIndex: null });
const extras = (n: number): ExtraLine[] => Array.from({ length: n }, (_, i) => extra(i));
const base = { recordedOpen: false, extrasOpen: false, extrasShown: EXTRAS_PAGE, extras: [] as ExtraLine[] };

describe('buildReviewItems', () => {
  it('new mode is the file order list, duplicates tagged', () => {
    const items = buildReviewItems({ ...base, mode: 'new', rows: [row(0), row(1, {}), row(2)] });
    expect(items.map((i) => (i.kind === 'row' ? i.tag : i.kind))).toEqual([null, 'duplicate', null]);
  });

  it('reconcile leads with missing, then a collapsed recorded summary', () => {
    const items = buildReviewItems({ ...base, mode: 'reconcile', rows: [row(0, {}), row(1), row(2, {}), row(3)] });
    expect(items.map((i) => i.kind)).toEqual(['row', 'row', 'recordedSummary']);
    expect(items[0]).toMatchObject({ tag: 'missing' });
    expect(items[2]).toMatchObject({ count: 2, open: false });
  });

  it('opening the summary lists the matched rows tagged recorded', () => {
    const items = buildReviewItems({ ...base, mode: 'reconcile', recordedOpen: true, rows: [row(0, {}), row(1)] });
    expect(items.map((i) => (i.kind === 'row' ? i.tag : i.kind))).toEqual(['missing', 'recordedSummary', 'recorded']);
  });

  it('adds no summary when nothing matched and no extras header when there are none', () => {
    const items = buildReviewItems({ ...base, mode: 'reconcile', rows: [row(0)] });
    expect(items.map((i) => i.kind)).toEqual(['row']);
  });

  it('keeps extras collapsed until opened, then shows a note and the extras', () => {
    const closed = buildReviewItems({ ...base, mode: 'reconcile', rows: [], extras: extras(3) });
    expect(closed.map((i) => i.kind)).toEqual(['extrasHeader']);
    const open = buildReviewItems({ ...base, mode: 'reconcile', rows: [], extras: extras(3), extrasOpen: true });
    expect(open.map((i) => i.kind)).toEqual(['extrasHeader', 'extrasNote', 'extra', 'extra', 'extra']);
  });

  it.each([
    [50, 50, 50],
    [100, 100, 20],
    [150, 120, 0],
  ])('with 120 extras and %s shown renders %s extras and showMore %s', (shown, rendered, more) => {
    const items = buildReviewItems({ ...base, mode: 'reconcile', rows: [], extras: extras(120), extrasOpen: true, extrasShown: shown });
    expect(items.filter((i) => i.kind === 'extra')).toHaveLength(rendered);
    const showMore = items.find((i) => i.kind === 'showMore');
    expect(showMore === undefined ? 0 : (showMore as { count: number }).count).toBe(more);
  });

  it('gives every item a unique key', () => {
    const items = buildReviewItems({
      ...base,
      mode: 'reconcile',
      recordedOpen: true,
      extrasOpen: true,
      rows: [row(0), row(1, {}), row(2, {})],
      extras: extras(60),
      extrasShown: 50,
    });
    const keys = items.map((i) => i.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
