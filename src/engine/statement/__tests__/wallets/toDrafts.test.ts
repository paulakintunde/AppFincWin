import fc from 'fast-check';
import { walletToDrafts } from '../../wallets';
import type { WalletKind, WalletLine, WalletRead } from '../../wallets';
import {
  csv, PAYPAL_HEADER, paypalRow, REVOLUT_HEADER, revolutRow, SENTINELS, WISE_HEADER, wiseRow,
} from './synthetic';
import { readWallet } from '../../wallets';

function line(over: Partial<WalletLine> & { index: number }): WalletLine {
  const grossMinor = over.grossMinor ?? -1000;
  const feeMinor = over.feeMinor ?? 0;
  return {
    currency: 'EUR', localDate: '2026-03-05', description: 'Shop', grossMinor, feeMinor, netMinor: grossMinor - feeMinor,
    externalId: null, pairKey: null, kind: 'payment', balanceMinor: null, ...over,
  };
}

function read(lines: WalletLine[], wallet: WalletKind = 'revolut'): Extract<WalletRead, { ok: true }> {
  return { ok: true, wallet, lines, skipped: 0 };
}

describe('walletToDrafts', () => {
  it('builds one draft per currency, sorted, with rows only in that currency', () => {
    const out = walletToDrafts(
      read([
        line({ index: 0, currency: 'GBP', grossMinor: -500, localDate: '2026-03-09' }),
        line({ index: 1, currency: 'EUR', grossMinor: 2000, localDate: '2026-03-01', balanceMinor: -50 }),
        line({ index: 2, currency: 'EUR', description: '', balanceMinor: 700, localDate: '2026-03-04' }),
      ])
    );
    expect(out.currencies).toEqual(['EUR', 'GBP']);
    expect(out.drafts.map((d) => d.currency)).toEqual(['EUR', 'GBP']);
    const eur = out.drafts[0]!;
    expect(eur.rows.map((r) => r.currency)).toEqual(['EUR', 'EUR']);
    expect(eur).toMatchObject({
      source: 'csv', layoutSignature: 'wallet|revolut|EUR', accountHint: 'bank', periodStart: '2026-03-01', periodEnd: '2026-03-04',
    });
    expect(eur.rows[0]).toMatchObject({
      index: 1, magnitude: 2000, marker: 'none', trnType: 'CREDIT', balanceMagnitude: 50, balanceMarker: 'minus', issues: [],
    });
    expect(eur.rows[1]).toMatchObject({ marker: 'minus', trnType: 'DEBIT', balanceMagnitude: 700, balanceMarker: 'none', issues: ['empty-description'] });
    expect(out.drafts[1]?.rows[0]).toMatchObject({ balanceMagnitude: null, balanceMarker: 'none' });
  });

  it('makes one fee line per line with a fee and keeps fee-only lines out of the rows', () => {
    const out = walletToDrafts(
      read([
        line({ index: 0, grossMinor: -1250, feeMinor: 30 }),
        line({ index: 1, grossMinor: 0, feeMinor: 40, kind: 'fee-only' }),
        line({ index: 2, grossMinor: -100 }),
      ])
    );
    expect(out.feeLines).toEqual([
      { forIndex: 0, currency: 'EUR', localDate: '2026-03-05', magnitude: 30 },
      { forIndex: 1, currency: 'EUR', localDate: '2026-03-05', magnitude: 40 },
    ]);
    expect(out.drafts[0]?.rows.map((r) => r.index)).toEqual([0, 2]);
  });

  it('returns a linked transfer pair per clean conversion, with its fee line index or null', () => {
    const out = walletToDrafts(
      read([
        line({ index: 0, grossMinor: -10000, kind: 'conversion', pairKey: 'A', feeMinor: 50 }),
        line({ index: 1, grossMinor: 8510, currency: 'GBP', kind: 'conversion', pairKey: 'A' }),
        // inflow line first, fee on the destination side
        line({ index: 2, grossMinor: 4000, currency: 'GBP', kind: 'conversion', pairKey: 'B', feeMinor: 20 }),
        line({ index: 3, grossMinor: -4700, currency: 'USD', kind: 'conversion', pairKey: 'B' }),
        // no fee at all
        line({ index: 4, grossMinor: -100, kind: 'conversion', pairKey: 'C' }),
        line({ index: 5, grossMinor: 90, currency: 'USD', kind: 'conversion', pairKey: 'C' }),
      ])
    );
    expect(out.transferPairs).toEqual([
      { fromIndex: 0, toIndex: 1, fromCurrency: 'EUR', toCurrency: 'GBP', feeIndex: 0 },
      { fromIndex: 3, toIndex: 2, fromCurrency: 'USD', toCurrency: 'GBP', feeIndex: 2 },
      { fromIndex: 4, toIndex: 5, fromCurrency: 'EUR', toCurrency: 'USD', feeIndex: null },
    ]);
  });

  it('leaves unpaired, same-currency or oversized conversion groups as plain rows', () => {
    const out = walletToDrafts(
      read([
        line({ index: 0, kind: 'conversion', pairKey: 'X' }),
        line({ index: 1, kind: 'conversion', pairKey: 'Y' }),
        line({ index: 2, kind: 'conversion', pairKey: 'Y' }),
        line({ index: 3, kind: 'conversion', pairKey: 'Z', currency: 'GBP' }),
        line({ index: 4, kind: 'conversion', pairKey: 'Z' }),
        line({ index: 5, kind: 'conversion', pairKey: 'Z', currency: 'USD' }),
        line({ index: 6, kind: 'conversion', pairKey: null }),
      ])
    );
    expect(out.transferPairs).toEqual([]);
    expect(out.drafts.flatMap((d) => d.rows)).toHaveLength(7);
  });

  it('builds a mixed EUR/GBP Revolut file end to end', () => {
    const r = readWallet(
      csv(REVOLUT_HEADER, [
        revolutRow({ amount: '-12.50', fee: '0.30' }),
        revolutRow({ type: 'EXCHANGE', amount: '-100.00', currency: 'EUR', date: '2026-03-06 09:00:00' }),
        revolutRow({ type: 'EXCHANGE', amount: '85.10', currency: 'GBP', date: '2026-03-06 09:00:00' }),
      ])
    ) as Extract<WalletRead, { ok: true }>;
    const out = walletToDrafts(r);
    expect(out.currencies).toEqual(['EUR', 'GBP']);
    expect(out.transferPairs).toHaveLength(1);
    expect(out.feeLines).toHaveLength(1);
  });

  it('copies no payer, payee, email, account or card digits into any field', () => {
    const outs = [
      walletToDrafts(readWallet(csv(WISE_HEADER, [wiseRow({ fees: '0.10' })])) as Extract<WalletRead, { ok: true }>),
      walletToDrafts(readWallet(csv(PAYPAL_HEADER, [paypalRow({})])) as Extract<WalletRead, { ok: true }>),
      walletToDrafts(readWallet(csv(REVOLUT_HEADER, [revolutRow({})])) as Extract<WalletRead, { ok: true }>),
    ];
    const json = JSON.stringify(outs);
    for (const s of SENTINELS) expect(json).not.toContain(s);
  });

  it('keeps balances exact: per currency, sum(gross) - sum(fees) equals sum(net)', () => {
    const lineArb = fc
      .record({
        currency: fc.constantFrom('EUR', 'GBP', 'USD'),
        gross: fc.integer({ min: -1_000_000, max: 1_000_000 }),
        fee: fc.integer({ min: 0, max: 5_000 }),
        date: fc.constantFrom('2026-03-01', '2026-03-15', '2026-04-02'),
      })
      .filter((x) => x.gross !== 0 || x.fee > 0);
    fc.assert(
      fc.property(fc.array(lineArb, { minLength: 1, maxLength: 40 }), (xs) => {
        const lines = xs.map((x, i) =>
          line({
            index: i, currency: x.currency, grossMinor: x.gross, feeMinor: x.fee, localDate: x.date,
            kind: x.gross === 0 ? 'fee-only' : 'payment',
          })
        );
        const out = walletToDrafts(read(lines));
        for (const d of out.drafts) {
          const gross = d.rows.reduce((s, r) => s + (r.marker === 'minus' ? -1 : 1) * (r.magnitude as number), 0);
          const fees = out.feeLines.filter((f) => f.currency === d.currency).reduce((s, f) => s + f.magnitude, 0);
          const net = lines.filter((l) => l.currency === d.currency).reduce((s, l) => s + l.netMinor, 0);
          if (gross - fees !== net) return false;
        }
        return true;
      })
    );
  });
});
