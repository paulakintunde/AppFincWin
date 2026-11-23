import { readWallet } from '../../wallets';
import type { WalletRead } from '../../wallets';
import {
  csv, PAYPAL_HEADER, paypalRow, REVOLUT_HEADER, revolutRow, SENTINELS, WISE_HEADER, wiseRow,
} from './synthetic';

function ok(text: string): Extract<WalletRead, { ok: true }> {
  const r = readWallet(text);
  if (r === null || !r.ok) throw new Error('expected a good read');
  return r;
}

function fail(text: string): Extract<WalletRead, { ok: false }> {
  const r = readWallet(text);
  if (r === null || r.ok) throw new Error('expected a failed read');
  return r;
}

describe('Revolut reader', () => {
  it('reads a card payment with a fee at gross, fee and net', () => {
    const r = ok(csv(REVOLUT_HEADER, [revolutRow({ amount: '-12.50', fee: '0.30', balance: '100.00' })]));
    expect(r.lines).toEqual([
      expect.objectContaining({
        index: 0, currency: 'EUR', localDate: '2026-03-05', description: 'Bakery', grossMinor: -1250,
        feeMinor: 30, netMinor: -1280, kind: 'payment', pairKey: null, externalId: null, balanceMinor: 10000,
      }),
    ]);
  });

  it('skips rows that are not COMPLETED and counts them', () => {
    const r = ok(csv(REVOLUT_HEADER, [revolutRow({}), revolutRow({ state: 'PENDING' })]));
    expect(r.lines).toHaveLength(1);
    expect(r.skipped).toBe(1);
  });

  it('gives an exchange pair the same pairKey and kind conversion', () => {
    const r = ok(
      csv(REVOLUT_HEADER, [
        revolutRow({ type: 'EXCHANGE', amount: '-100.00', currency: 'EUR', date: '2026-03-06 09:00:00' }),
        revolutRow({ type: 'EXCHANGE', amount: '85.10', currency: 'GBP', date: '2026-03-06 09:00:00' }),
      ])
    );
    expect(r.lines.map((l) => l.kind)).toEqual(['conversion', 'conversion']);
    expect(r.lines[0]?.pairKey).toBe('2026-03-06 09:00:00');
    expect(r.lines[0]?.pairKey).toBe(r.lines[1]?.pairKey);
  });

  it('treats a blank fee as zero, a blank balance as null and short rows as blank cells', () => {
    const text =
      csv(REVOLUT_HEADER, [revolutRow({ fee: '', balance: '' })]) +
      'CARD_PAYMENT,Current,2026-03-05 10:00:00,2026-03-05 10:00:00,Shop,-5.00,0.00,EUR,COMPLETED\n';
    const r = ok(text);
    expect(r.lines[0]).toMatchObject({ feeMinor: 0, balanceMinor: null });
    expect(r.lines[1]).toMatchObject({ grossMinor: -500, balanceMinor: null });
  });

  it('works when the optional Balance column is absent', () => {
    const header = REVOLUT_HEADER.filter((h) => h !== 'Balance');
    const row = revolutRow({}).slice(0, 9);
    expect(ok(csv(header, [row])).lines[0]?.balanceMinor).toBeNull();
  });

  it('keeps an unreadable balance as null', () => {
    expect(ok(csv(REVOLUT_HEADER, [revolutRow({ balance: 'n/a' })])).lines[0]?.balanceMinor).toBeNull();
  });

  it('reports a missing column', () => {
    const header = REVOLUT_HEADER.filter((h) => h !== 'Fee');
    expect(fail(csv(header, [revolutRow({}).filter((_, i) => i !== 6)]))).toEqual({
      ok: false, wallet: 'revolut', error: 'missing-column', missing: ['Fee'],
    });
  });
});

describe('Wise reader', () => {
  it('reads Total fees into feeMinor and the running balance', () => {
    const r = ok(csv(WISE_HEADER, [wiseRow({ id: 'CARD-9', amount: '-20.00', fees: '0.50', balance: '-3.00' })]));
    expect(r.lines[0]).toMatchObject({
      currency: 'EUR', localDate: '2026-03-05', grossMinor: -2000, feeMinor: 50, netMinor: -2050,
      externalId: 'CARD-9', pairKey: null, balanceMinor: -300, kind: 'payment',
    });
  });

  it('pairs Exchange From/To rows by TransferWise ID and suffixes the line id with the currency', () => {
    const r = ok(
      csv(WISE_HEADER, [
        wiseRow({ id: 'BAL-7', amount: '-100.00', currency: 'EUR', from: 'EUR', to: 'GBP' }),
        wiseRow({ id: 'BAL-7', amount: '85.10', currency: 'GBP', from: 'EUR', to: 'GBP' }),
        wiseRow({ id: '', amount: '1.00', from: 'EUR', to: 'GBP' }),
      ])
    );
    expect(r.lines[0]).toMatchObject({ kind: 'conversion', pairKey: 'BAL-7', externalId: 'BAL-7|EUR' });
    expect(r.lines[1]).toMatchObject({ kind: 'conversion', pairKey: 'BAL-7', externalId: 'BAL-7|GBP' });
    expect(r.lines[2]).toMatchObject({ kind: 'conversion', pairKey: null, externalId: null });
  });

  it('skips rows with an empty Amount', () => {
    const r = ok(csv(WISE_HEADER, [wiseRow({ amount: '' }), wiseRow({})]));
    expect(r.skipped).toBe(1);
    expect(r.lines).toHaveLength(1);
  });

  it('reports a missing Currency column', () => {
    const header = WISE_HEADER.filter((h) => h !== 'Currency');
    expect(fail(csv(header, [wiseRow({}).filter((_, i) => i !== 3)]))).toEqual({
      ok: false, wallet: 'wise', error: 'missing-column', missing: ['Currency'],
    });
  });

  it('works without the optional Total fees column and marks a fee-only row', () => {
    const header = WISE_HEADER.filter((h) => h !== 'Total fees');
    const row = wiseRow({ amount: '0.00' }).slice(0, 18);
    const row2 = wiseRow({}).slice(0, 18);
    const r = ok(csv(header, [row, row2]));
    expect(r.skipped).toBe(1);
    expect(r.lines).toHaveLength(1);
    const feeOnly = ok(csv(WISE_HEADER, [wiseRow({ amount: '0.00', fees: '0.40' })]));
    expect(feeOnly.lines[0]).toMatchObject({ kind: 'fee-only', grossMinor: 0, feeMinor: 40, netMinor: -40 });
  });
});

describe('PayPal reader', () => {
  it('reads gross, fee and net from a completed payment', () => {
    const r = ok(csv(PAYPAL_HEADER, [paypalRow({ item: 'Headphones', balance: '1,234.56' })]));
    expect(r.lines[0]).toMatchObject({
      currency: 'USD', localDate: '2026-03-05', description: 'Headphones', grossMinor: -5000, feeMinor: 175,
      netMinor: -5175, externalId: 'TX-1', kind: 'payment', balanceMinor: 123456,
    });
  });

  it('falls back to the type as the description', () => {
    expect(ok(csv(PAYPAL_HEADER, [paypalRow({})])).lines[0]?.description).toBe('Express Checkout Payment');
  });

  it('skips pending rows and Memo rows', () => {
    const r = ok(
      csv(PAYPAL_HEADER, [paypalRow({}), paypalRow({ status: 'Pending' }), paypalRow({ impact: 'Memo' })])
    );
    expect(r.skipped).toBe(2);
    expect(r.lines).toHaveLength(1);
  });

  it('gives two currency conversion rows sharing a Reference Txn ID one pairKey', () => {
    const r = ok(
      csv(PAYPAL_HEADER, [
        paypalRow({ type: 'General Currency Conversion', gross: '-100.00', fee: '0.00', currency: 'USD', ref: 'REF-1', id: 'C1' }),
        paypalRow({ type: 'General Currency Conversion', gross: '92.00', fee: '0.00', currency: 'EUR', ref: 'REF-1', id: 'C2' }),
        paypalRow({ type: 'General Currency Conversion', gross: '5.00', fee: '0.00', currency: 'EUR', ref: '', id: '' }),
      ])
    );
    expect(r.lines.map((l) => l.pairKey)).toEqual(['REF-1', 'REF-1', null]);
    expect(r.lines[2]?.externalId).toBeNull();
    expect(r.lines.every((l) => l.kind === 'conversion')).toBe(true);
  });

  it('keeps an inflow fee as a magnitude that reduces the net', () => {
    const r = ok(csv(PAYPAL_HEADER, [paypalRow({ gross: '100.00', fee: '-3.20', net: '96.80', impact: 'Credit' })]));
    expect(r.lines[0]).toMatchObject({ grossMinor: 10000, feeMinor: 320, netMinor: 9680 });
  });

  it('works without the optional Balance Impact and Item Title columns', () => {
    const drop = ['Balance Impact', 'Item Title'];
    const header = PAYPAL_HEADER.filter((h) => !drop.includes(h));
    const row = paypalRow({}).filter((_, i) => !drop.includes(PAYPAL_HEADER[i] as string));
    expect(ok(csv(header, [row])).lines).toHaveLength(1);
  });

  it('reports a missing column', () => {
    const header = PAYPAL_HEADER.filter((h) => h !== 'Status');
    const row = paypalRow({}).filter((_, i) => PAYPAL_HEADER[i] !== 'Status');
    expect(fail(csv(header, [row]))).toMatchObject({ error: 'missing-column', missing: ['Status'] });
  });
});

describe('unreadable cells and number parsing', () => {
  const bad = (over: Parameters<typeof revolutRow>[0]) => fail(csv(REVOLUT_HEADER, [revolutRow(over)]));

  it('refuses a file with an unreadable amount, fee, date or currency', () => {
    for (const o of [{ amount: 'abc' }, { fee: 'abc' }, { date: 'yesterday' }, { date: '2026-02-31 10:00:00' }, { currency: 'EURO' }]) {
      expect(bad(o)).toEqual({ ok: false, wallet: 'revolut', error: 'unreadable' });
    }
  });

  it('refuses more decimals than the currency allows and amounts too large to hold exactly', () => {
    expect(bad({ amount: '1.234' }).error).toBe('unreadable');
    expect(bad({ amount: '99999999999999999999999.00' }).error).toBe('unreadable');
    expect(bad({ amount: '90071992547409.93' }).error).toBe('unreadable');
  });

  it('reads signs, thousands separators, zero-decimal currencies and the true minus', () => {
    const r = ok(
      csv(REVOLUT_HEADER, [
        revolutRow({ amount: '+1,000.5' }),
        revolutRow({ amount: '−2.00' }),
        revolutRow({ amount: '-500', currency: 'jpy' }),
        revolutRow({ amount: '7' }),
      ])
    );
    expect(r.lines.map((l) => l.grossMinor)).toEqual([100050, -200, -500, 700]);
  });

  it('skips a row where nothing moves', () => {
    const r = ok(csv(REVOLUT_HEADER, [revolutRow({ amount: '0.00', fee: '0.00' }), revolutRow({})]));
    expect(r.skipped).toBe(1);
  });

  it('collapses whitespace and caps long descriptions and ids', () => {
    const r = ok(csv(WISE_HEADER, [wiseRow({ description: `  a   b ${'x'.repeat(300)}`, id: 'I'.repeat(400) })]));
    expect(r.lines[0]?.description.length).toBe(200);
    expect(r.lines[0]?.description.startsWith('a b x')).toBe(true);
    expect(r.lines[0]?.externalId?.length).toBe(255);
  });

  it('never carries personal data into any output field', () => {
    const text =
      csv(WISE_HEADER, [wiseRow({})]) + csv(REVOLUT_HEADER, [revolutRow({})]);
    const reads = [
      ok(csv(WISE_HEADER, [wiseRow({})])),
      ok(csv(PAYPAL_HEADER, [paypalRow({})])),
    ];
    const json = JSON.stringify(reads);
    expect(text.length).toBeGreaterThan(0);
    for (const s of SENTINELS) expect(json).not.toContain(s);
  });
});
