import { buildTransferLegs, transferEditPatches, type TransferPairState } from '../pair';
import { minorUnits } from '../../money/types';

describe('buildTransferLegs', () => {
  it('builds two legs, opposite signed, sharing the transfer id and date', () => {
    const result = buildTransferLegs({
      transferId: 't1',
      outId: 'leg-out',
      inId: 'leg-in',
      from: { id: 'a1', currency: 'GBP' },
      to: { id: 'a2', currency: 'GBP' },
      amountOut: minorUnits(5000),
      amountIn: minorUnits(5000),
      localDate: '2026-09-05',
    });

    expect(result).toEqual({
      ok: true,
      legs: [
        {
          id: 'leg-out',
          accountId: 'a1',
          amount: minorUnits(-5000),
          currency: 'GBP',
          localDate: '2026-09-05',
          transferId: 't1',
        },
        {
          id: 'leg-in',
          accountId: 'a2',
          amount: minorUnits(5000),
          currency: 'GBP',
          localDate: '2026-09-05',
          transferId: 't1',
        },
      ],
    });
  });

  it('rejects the same account for both legs', () => {
    const result = buildTransferLegs({
      transferId: 't1',
      outId: 'leg-out',
      inId: 'leg-in',
      from: { id: 'a1', currency: 'GBP' },
      to: { id: 'a1', currency: 'GBP' },
      amountOut: minorUnits(5000),
      amountIn: minorUnits(5000),
      localDate: '2026-09-05',
    });
    expect(result).toEqual({ ok: false, error: 'same-account' });
  });

  it('rejects a non-positive amountOut', () => {
    const result = buildTransferLegs({
      transferId: 't1',
      outId: 'leg-out',
      inId: 'leg-in',
      from: { id: 'a1', currency: 'GBP' },
      to: { id: 'a2', currency: 'GBP' },
      amountOut: minorUnits(0),
      amountIn: minorUnits(5000),
      localDate: '2026-09-05',
    });
    expect(result).toEqual({ ok: false, error: 'non-positive' });
  });

  it('rejects a non-positive amountIn', () => {
    const result = buildTransferLegs({
      transferId: 't1',
      outId: 'leg-out',
      inId: 'leg-in',
      from: { id: 'a1', currency: 'GBP' },
      to: { id: 'a2', currency: 'GBP' },
      amountOut: minorUnits(5000),
      amountIn: minorUnits(0),
      localDate: '2026-09-05',
    });
    expect(result).toEqual({ ok: false, error: 'non-positive' });
  });

  it('rejects a same-currency mismatch', () => {
    const result = buildTransferLegs({
      transferId: 't1',
      outId: 'leg-out',
      inId: 'leg-in',
      from: { id: 'a1', currency: 'GBP' },
      to: { id: 'a2', currency: 'GBP' },
      amountOut: minorUnits(5000),
      amountIn: minorUnits(4900),
      localDate: '2026-09-05',
    });
    expect(result).toEqual({ ok: false, error: 'same-currency-mismatch' });
  });

  it('allows cross-currency legs with different amounts, kept as given', () => {
    const result = buildTransferLegs({
      transferId: 't1',
      outId: 'leg-out',
      inId: 'leg-in',
      from: { id: 'a1', currency: 'GBP' },
      to: { id: 'a2', currency: 'EUR' },
      amountOut: minorUnits(5000),
      amountIn: minorUnits(5800),
      localDate: '2026-09-05',
    });
    expect(result).toEqual({
      ok: true,
      legs: [
        {
          id: 'leg-out',
          accountId: 'a1',
          amount: minorUnits(-5000),
          currency: 'GBP',
          localDate: '2026-09-05',
          transferId: 't1',
        },
        {
          id: 'leg-in',
          accountId: 'a2',
          amount: minorUnits(5800),
          currency: 'EUR',
          localDate: '2026-09-05',
          transferId: 't1',
        },
      ],
    });
  });

  it('rejects a bad date', () => {
    const result = buildTransferLegs({
      transferId: 't1',
      outId: 'leg-out',
      inId: 'leg-in',
      from: { id: 'a1', currency: 'GBP' },
      to: { id: 'a2', currency: 'GBP' },
      amountOut: minorUnits(5000),
      amountIn: minorUnits(5000),
      localDate: '2026-13-40',
    });
    expect(result).toEqual({ ok: false, error: 'bad-date' });
  });
});

describe('transferEditPatches', () => {
  function state(overrides?: Partial<TransferPairState>): TransferPairState {
    return {
      out: { accountId: 'a1', currency: 'GBP', amount: -5000, localDate: '2026-09-05' },
      in: { accountId: 'a2', currency: 'GBP', amount: 5000, localDate: '2026-09-05' },
      ...overrides,
    };
  }

  it('date change patches local_date on both legs', () => {
    const before = state();
    const after = state({
      out: { ...before.out, localDate: '2026-09-06' },
      in: { ...before.in, localDate: '2026-09-06' },
    });
    expect(transferEditPatches(before, after)).toEqual({
      out: { local_date: '2026-09-06' },
      in: { local_date: '2026-09-06' },
    });
  });

  it('same-currency amount 5000 -> 6000 patches both legs equal and opposite', () => {
    const before = state();
    const after = state({
      out: { ...before.out, amount: -6000 },
      in: { ...before.in, amount: 6000 },
    });
    expect(transferEditPatches(before, after)).toEqual({
      out: { original_amount: -6000 },
      in: { original_amount: 6000 },
    });
  });

  it('cross-currency: only the in-leg amount changed patches the in leg only', () => {
    const before = state({
      out: { accountId: 'a1', currency: 'GBP', amount: -5000, localDate: '2026-09-05' },
      in: { accountId: 'a2', currency: 'EUR', amount: 5800, localDate: '2026-09-05' },
    });
    const after = state({
      out: before.out,
      in: { ...before.in, amount: 6000 },
    });
    expect(transferEditPatches(before, after)).toEqual({
      out: {},
      in: { original_amount: 6000 },
    });
  });

  it('to-account changed patches account_id and original_currency on the in leg', () => {
    const before = state();
    const after = state({
      out: before.out,
      in: { ...before.in, accountId: 'a3', currency: 'USD' },
    });
    expect(transferEditPatches(before, after)).toEqual({
      out: {},
      in: { account_id: 'a3', original_currency: 'USD' },
    });
  });

  it('nothing changed -> empty patches', () => {
    const before = state();
    const after = state();
    expect(transferEditPatches(before, after)).toEqual({ out: {}, in: {} });
  });
});
