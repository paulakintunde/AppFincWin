// 10.1-07 (T-10.1-07-01/02): split, receipt and scan copy. Declarative, no advice, no online-reading copy (D-18).
import en from '../locales/en';
import { split, receipt, scan } from '../locales/splitReceipts';

function collect(node: unknown, prefix = ''): { path: string; value: string }[] {
  if (typeof node === 'string') return [{ path: prefix, value: node }];
  if (node && typeof node === 'object') {
    return Object.entries(node as Record<string, unknown>).flatMap(([k, v]) => collect(v, prefix ? `${prefix}.${k}` : k));
  }
  return [];
}

const strings = [...collect(split, 'split'), ...collect(receipt, 'receipt'), ...collect(scan, 'scan')];

// Same interpolation the app uses ({{x}} double braces).
function fill(s: string, p: Record<string, string | number> = {}): string {
  return s.replace(/\{\{(\w+)\}\}/g, (_, k: string) => String(p[k]));
}

describe('split, receipt and scan copy', () => {
  it('is wired into en.ts', () => {
    expect(en.split).toBe(split);
    expect(en.receipt).toBe(receipt);
    expect(en.scan).toBe(scan);
  });

  it('has exact wording for the key strings', () => {
    expect(fill(split.balance.left, { amount: '$5.00' })).toBe('$5.00 left to place');
    expect(fill(split.tag, { count: 3 })).toBe('3 categories');
    expect(scan.fail.body).toBe('You can try again with a flatter photo, or enter the items yourself.');
    expect(scan.review.footer).toBe('FincWin reads the printed words. Check each figure before you use it.');
    expect(receipt.delete.note).toBe('Its receipts are deleted too.');
    expect(receipt.viewer.openFailed.body).toBe('Your records are safe.');
  });

  it('uses double-brace params only', () => {
    expect(strings.filter((s) => /(^|[^{])\{\w+\}([^}]|$)/.test(s.value))).toEqual([]);
  });

  it('ships no online-reading copy (D-18)', () => {
    expect(strings.filter((s) => /online/i.test(s.value) && !/back online/i.test(s.value))).toEqual([]);
    expect(Object.keys(scan)).not.toContain('online');
  });

  it('uses no advice or overclaim words', () => {
    const bad = strings.filter((s) =>
      /\b(advice|advise|recommend\w*|you should|suggest\w*|better|best|free|sure|accurate\w*)\b/i.test(s.value)
    );
    expect(bad).toEqual([]);
  });

  it('adds the quick menu, add group and feature strings', () => {
    expect(en.shell.quick.scanReceipt).toBe('Scan a receipt');
    expect(en.you.add.scanReceipt).toBe('Scan a receipt');
    expect(en.you.add.scanReceiptHint).toBe('Reads a receipt into a new line');
  });
});
