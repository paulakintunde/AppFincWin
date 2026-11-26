// 10.1-15 (D-22): the real-reader gate over the labelled corpus (fixtures/corpus, read on the Pixel by ML Kit in
// 10.1-08). Trust rule: whenever the parsed total differs from the true total, the total is flagged or reconcile
// shows the mismatch. With a frames-capable reader, totals must be exactly right on at least 80% of receipts.
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { parseReceipt } from '../parseReceipt';
import { reconcile } from '../reconcile';
import type { DateOrder } from '../dates';
import type { ReceiptOcr } from '../types';

interface Expected { store: string | null; date: string | null; total: number; itemCount: number; tax: number; tip: number; currency: string }
interface Fixture { name: string; module: string; ocr: ReceiptOcr; expected: Expected | null }

const DIR = join(__dirname, 'fixtures', 'corpus');
const fixtures: Fixture[] = readdirSync(DIR)
  .filter((f) => /^r\d+\.json$/.test(f))
  .sort()
  .map((f) => JSON.parse(readFileSync(join(DIR, f), 'utf8')) as Fixture);
const labelled = fixtures.filter((f): f is Fixture & { expected: Expected } => f.expected !== null);

/** The date order a user in the receipt's currency region would have set (the app passes the user's own setting). */
const orderFor = (currency: string): DateOrder => (currency === 'GBP' || currency === 'EUR' ? 'DMY' : 'MDY');

const results = labelled.map((f) => {
  const out = parseReceipt(f.ocr, { currency: f.expected.currency, dateOrder: orderFor(f.expected.currency), today: '2026-11-25' });
  const r = out.receipt;
  const sum = (kind: string) => r.extras.filter((x) => x.kind === kind).reduce((s, x) => s + x.amount, 0);
  return { f, r, rec: reconcile(r), framed: f.ocr.lines.every((l) => l.frame !== null), tax: sum('tax'), tip: sum('tip') };
});

describe('10.1-15 receipt corpus gate', () => {
  it('has labelled fixtures', () => {
    expect(labelled.length).toBe(fixtures.length);
    expect(labelled.length).toBeGreaterThan(0);
  });

  it.each(results.map((x) => [x.f.name, x] as const))('%s: a wrong total is never silent', (_name, x) => {
    expect(x.r.total.value === x.f.expected.total || x.r.total.unsure || x.rec.state !== 'match').toBe(true);
  });

  it('totals are exactly right on at least 80% of receipts read with frames', () => {
    const framed = results.filter((x) => x.framed);
    const hits = framed.filter((x) => x.r.total.value === x.f.expected.total).length;
    const items = results.filter((x) => x.r.items.length === x.f.expected.itemCount).length;
    const flaggedRight = results.filter((x) => x.r.total.value === x.f.expected.total && x.r.total.unsure).length;
    const dates = results.filter((x) => x.r.date.value === x.f.expected.date).length;
    const stores = results.filter((x) => x.r.store.value === x.f.expected.store).length;
    const taxTip = results.filter((x) => x.tax === x.f.expected.tax && x.tip === x.f.expected.tip).length;
    // Information only (no gate): printed so a regression is visible in the test log.
    process.stdout.write(
      `receipt corpus: ${results.length} receipts; totals ${hits}/${framed.length}; item counts ${items}/${results.length}; ` +
        `flagged but right ${flaggedRight}; dates ${dates}; stores ${stores}; tax and tip ${taxTip}\n`,
    );
    expect(framed.length).toBeGreaterThan(0);
    expect(hits * 100).toBeGreaterThanOrEqual(framed.length * 80);
  });
});
