import fc from 'fast-check';
import { minorUnits } from '../../money';
import { balanceMeansFor, candidateProfiles, flipProfile, inferProfile } from '../profile';
import type { AccountKind, DraftRow, FormatProfile, ProfileResult, StatementDraft } from '../types';
import { arbLedger, renderDraft } from './fixtures/ledgers';

function makeRow(index: number, overrides: Partial<DraftRow> = {}): DraftRow {
  return {
    index,
    localDate: '2026-01-01',
    description: 'Row',
    magnitude: minorUnits(100),
    marker: 'none',
    rawAmount: '1.00',
    balanceMagnitude: null,
    balanceMarker: 'none',
    rawBalance: null,
    currency: 'GBP',
    externalId: null,
    trnType: null,
    issues: [],
    ...overrides,
  };
}

function makeDraft(overrides: Partial<StatementDraft> = {}): StatementDraft {
  return {
    source: 'csv',
    layoutSignature: 'date|description|amount',
    accountHint: null,
    currency: 'GBP',
    rows: [],
    statedOpening: null,
    statedClosing: null,
    available: null,
    statedLimit: null,
    balanceLabel: null,
    labels: [],
    periodStart: null,
    periodEnd: null,
    warnings: [],
    ...overrides,
  };
}

function makeProfile(overrides: Partial<FormatProfile> = {}): FormatProfile {
  return {
    version: 1,
    source: 'csv',
    accountFamily: 'deposit',
    positiveMeans: 'money-in',
    balanceMeans: 'held',
    statedLimit: null,
    decidedBy: 'user',
    ...overrides,
  };
}

function asDecided(result: ProfileResult): { profile: FormatProfile; evidence: ProfileResult['evidence'] } {
  if (result.kind !== 'decided') throw new Error(`expected decided, got ${result.kind}`);
  return { profile: result.profile, evidence: result.evidence };
}

function asAmbiguous(result: ProfileResult): { candidates: FormatProfile[]; evidence: ProfileResult['evidence'] } {
  if (result.kind !== 'ambiguous') throw new Error(`expected ambiguous, got ${result.kind}`);
  return { candidates: result.candidates, evidence: result.evidence };
}

describe('balanceMeansFor', () => {
  it('checking/savings/cash/investment/other -> held', () => {
    const kinds: AccountKind[] = ['checking', 'savings', 'cash', 'investment', 'other'];
    const draft = makeDraft({ statedOpening: { magnitude: minorUnits(100), marker: 'none', asOf: null, raw: '1.00' } });
    for (const kind of kinds) {
      expect(balanceMeansFor(kind, draft)).toBe('held');
    }
  });

  it('credit -> owed, when no available label', () => {
    const draft = makeDraft({ statedOpening: { magnitude: minorUnits(100), marker: 'none', asOf: null, raw: '1.00' } });
    expect(balanceMeansFor('credit', draft)).toBe('owed');
  });

  it("credit -> available, when draft.balanceLabel === 'available'", () => {
    const draft = makeDraft({
      statedOpening: { magnitude: minorUnits(100), marker: 'none', asOf: null, raw: '1.00' },
      balanceLabel: 'available',
    });
    expect(balanceMeansFor('credit', draft)).toBe('available');
  });

  it("credit -> available, when labels include 'available-balance-label'", () => {
    const draft = makeDraft({
      statedOpening: { magnitude: minorUnits(100), marker: 'none', asOf: null, raw: '1.00' },
      labels: ['available-balance-label'],
    });
    expect(balanceMeansFor('credit', draft)).toBe('available');
  });

  it('loan -> owed', () => {
    const draft = makeDraft({ statedOpening: { magnitude: minorUnits(100), marker: 'none', asOf: null, raw: '1.00' } });
    expect(balanceMeansFor('loan', draft)).toBe('owed');
  });

  it('no balances anywhere in the draft -> none', () => {
    const draft = makeDraft({ rows: [makeRow(0)] });
    expect(balanceMeansFor('checking', draft)).toBe('none');
    expect(balanceMeansFor('credit', draft)).toBe('none');
  });
});

describe('candidateProfiles', () => {
  it('returns two profiles with the same balanceMeans/accountFamily, s = money-in then money-spent', () => {
    const draft = makeDraft();
    const [a, b] = candidateProfiles(draft, 'checking');
    expect(a.positiveMeans).toBe('money-in');
    expect(b.positiveMeans).toBe('money-spent');
    expect(a.balanceMeans).toBe(b.balanceMeans);
    expect(a.accountFamily).toBe(b.accountFamily);
    expect(a.accountFamily).toBe('deposit');
  });
});

describe('flipProfile', () => {
  it('swaps positiveMeans, keeps balanceMeans/accountFamily/statedLimit, sets decidedBy user', () => {
    const p = makeProfile({ positiveMeans: 'money-in', balanceMeans: 'owed', accountFamily: 'card', statedLimit: minorUnits(100000), decidedBy: 'labels' });
    const flipped = flipProfile(p);
    expect(flipped.positiveMeans).toBe('money-spent');
    expect(flipped.balanceMeans).toBe('owed');
    expect(flipped.accountFamily).toBe('card');
    expect(flipped.statedLimit).toBe(100000);
    expect(flipped.decidedBy).toBe('user');
  });

  it('flipProfile(flipProfile(p)) equals p apart from decidedBy', () => {
    const p = makeProfile({ positiveMeans: 'money-spent', balanceMeans: 'held', decidedBy: 'reconciliation' });
    const twice = flipProfile(flipProfile(p));
    expect(twice.positiveMeans).toBe(p.positiveMeans);
    expect(twice.balanceMeans).toBe(p.balanceMeans);
    expect(twice.accountFamily).toBe(p.accountFamily);
    expect(twice.statedLimit).toBe(p.statedLimit);
    expect(twice.decidedBy).toBe('user');
  });
});

describe('inferProfile: labels decide outright (debit/credit columns)', () => {
  it('checking account, CSV with separate Paid out / Paid in columns -> decided, decidedBy labels, evidence includes debit-credit-columns and account-kind', () => {
    const draft = makeDraft({
      labels: ['debit-credit-columns'],
      rows: [makeRow(0, { marker: 'dr' }), makeRow(1, { marker: 'cr' })],
    });
    const result = inferProfile(draft, { kind: 'checking', limit: null }, null);
    const { profile, evidence } = asDecided(result);
    expect(profile.decidedBy).toBe('labels');
    expect(evidence).toEqual(expect.arrayContaining(['debit-credit-columns', 'account-kind']));
  });
});

describe('inferProfile: overdrawn current account decided by reconciliation', () => {
  it('signed amounts, running balance going from +120.00 to -240.00 -> decided money-in / held / reconciliation', () => {
    // true ledger (stored convention): opening +12000 (held, +120.00), two money-out rows
    // -27000 then -9000, ending at -24000 (-240.00). Rendered under s = +1 (money-in): raw
    // sign follows the stored sign directly (marker 'minus' for both, since both are money out).
    const draft = makeDraft({
      statedOpening: { magnitude: minorUnits(12000), marker: 'none', asOf: null, raw: '120.00' },
      rows: [
        makeRow(0, { magnitude: minorUnits(27000), marker: 'minus', balanceMagnitude: minorUnits(15000), balanceMarker: 'minus' }),
        makeRow(1, { magnitude: minorUnits(9000), marker: 'minus', balanceMagnitude: minorUnits(24000), balanceMarker: 'minus' }),
      ],
    });
    const result = inferProfile(draft, { kind: 'checking', limit: null }, null);
    const { profile } = asDecided(result);
    expect(profile.positiveMeans).toBe('money-in');
    expect(profile.balanceMeans).toBe('held');
    expect(profile.decidedBy).toBe('reconciliation');
  });
});

describe('inferProfile: card over limit, issuer view', () => {
  it('purchases positive, PAYMENT - THANK YOU negative, balance 1250.00 owed -> decided money-spent / owed', () => {
    // true ledger (stored): opening owed 1000.00 (-100000). A purchase is money out
    // (-25000 stored), a payment is money in (+10000 stored). Under s = -1 (money-spent,
    // issuer view): raw sign = stored-sign * s, so the purchase's raw is positive (shown
    // as a plain positive purchase) and the payment's raw is negative ("PAYMENT - THANK
    // YOU" shown negative) -- both exactly as the issuer-view convention describes. The
    // owed formula reads a positive raw balance as the owed amount, independent of s.
    const draft = makeDraft({
      statedOpening: { magnitude: minorUnits(100000), marker: 'none', asOf: null, raw: '1000.00' },
      rows: [
        makeRow(0, {
          description: 'TESCO',
          magnitude: minorUnits(25000),
          marker: 'none',
          balanceMagnitude: minorUnits(125000),
          balanceMarker: 'none',
        }),
        makeRow(1, {
          description: 'PAYMENT - THANK YOU',
          magnitude: minorUnits(10000),
          marker: 'minus',
          balanceMagnitude: minorUnits(115000),
          balanceMarker: 'none',
        }),
      ],
    });
    const result = inferProfile(draft, { kind: 'credit', limit: null }, null);
    const { profile, evidence } = asDecided(result);
    expect(profile.positiveMeans).toBe('money-spent');
    expect(profile.balanceMeans).toBe('owed');
    expect(evidence).toEqual(expect.arrayContaining(['payment-row-sign', 'running-balance']));
  });
});

describe('inferProfile: card, account-holder view', () => {
  it('purchases negative -> decided money-in / owed', () => {
    // Same true ledger as the issuer-view case, but rendered under s = +1 (money-in,
    // account-holder view): raw sign = stored-sign directly, so the purchase (money out)
    // shows negative and the payment (money in) shows positive.
    const draft = makeDraft({
      statedOpening: { magnitude: minorUnits(100000), marker: 'none', asOf: null, raw: '1000.00' },
      rows: [
        makeRow(0, {
          description: 'TESCO',
          magnitude: minorUnits(25000),
          marker: 'minus',
          balanceMagnitude: minorUnits(125000),
          balanceMarker: 'none',
        }),
        makeRow(1, {
          description: 'PAYMENT RECEIVED',
          magnitude: minorUnits(10000),
          marker: 'none',
          balanceMagnitude: minorUnits(115000),
          balanceMarker: 'none',
        }),
      ],
    });
    const result = inferProfile(draft, { kind: 'credit', limit: null }, null);
    const { profile } = asDecided(result);
    expect(profile.positiveMeans).toBe('money-in');
    expect(profile.balanceMeans).toBe('owed');
  });
});

describe("inferProfile: card CSV whose balance header contains 'Available'", () => {
  it("balanceMeans -> available", () => {
    const draft = makeDraft({
      balanceLabel: 'available',
      rows: [
        makeRow(0, {
          description: 'PAYMENT - THANK YOU',
          magnitude: minorUnits(25000),
          marker: 'minus',
          balanceMagnitude: minorUnits(75000),
          balanceMarker: 'none',
        }),
      ],
    });
    const result = inferProfile(draft, { kind: 'credit', limit: null }, null);
    const { profile } = asDecided(result);
    expect(profile.balanceMeans).toBe('available');
  });
});

describe('inferProfile: OFX card with LEDGERBAL owed and AVAILBAL, statedLimit derived', () => {
  it('owed 1,250.00 and available -250.00 -> statedLimit 100000', () => {
    const draft = makeDraft({
      source: 'ofx',
      statedClosing: { magnitude: minorUnits(125000), marker: 'none', asOf: null, raw: '1250.00' },
      available: { magnitude: minorUnits(25000), marker: 'minus', asOf: null, raw: '-250.00' },
      rows: [makeRow(0, { description: 'PAYMENT - THANK YOU', magnitude: minorUnits(1000), marker: 'minus' })],
    });
    const result = inferProfile(draft, { kind: 'credit', limit: null }, null);
    const { profile } = asDecided(result);
    expect(profile.statedLimit).toBe(100000);
  });
});

describe('inferProfile: OFX bank with TRNTYPE agreeing', () => {
  it('decided via trntype-agrees', () => {
    const draft = makeDraft({
      source: 'ofx',
      rows: [
        makeRow(0, { magnitude: minorUnits(5000), marker: 'none', trnType: 'CREDIT' }),
        makeRow(1, { magnitude: minorUnits(3000), marker: 'minus', trnType: 'DEBIT' }),
        makeRow(2, { magnitude: minorUnits(2000), marker: 'minus', trnType: 'DEBIT' }),
      ],
    });
    const result = inferProfile(draft, { kind: 'checking', limit: null }, null);
    const { profile, evidence } = asDecided(result);
    expect(profile.positiveMeans).toBe('money-in');
    expect(evidence).toContain('trntype-agrees');
  });
});

describe('inferProfile: no balance column, no labels, all rows one sign', () => {
  it('ambiguous, candidates money-spent first then money-in (majority prior)', () => {
    const draft = makeDraft({
      rows: [makeRow(0, { magnitude: minorUnits(1000), marker: 'none' }), makeRow(1, { magnitude: minorUnits(2000), marker: 'none' })],
    });
    const result = inferProfile(draft, { kind: 'checking', limit: null }, null);
    const { candidates } = asAmbiguous(result);
    expect(candidates).toHaveLength(2);
    expect(candidates[0]?.positiveMeans).toBe('money-spent');
    expect(candidates[1]?.positiveMeans).toBe('money-in');
  });
});

describe('inferProfile: no balance column, mixed signs, a payment-like row on a card', () => {
  it('decided from that row sign', () => {
    const draft = makeDraft({
      rows: [
        makeRow(0, { description: 'TESCO', magnitude: minorUnits(1000), marker: 'none' }),
        makeRow(1, { description: 'PAYMENT - THANK YOU', magnitude: minorUnits(500), marker: 'minus' }),
      ],
    });
    const result = inferProfile(draft, { kind: 'credit', limit: null }, null);
    const { profile, evidence } = asDecided(result);
    expect(evidence).toContain('payment-row-sign');
    expect(profile.positiveMeans).toBe('money-spent');
  });
});

describe('inferProfile: one-row file with no balance and no labels', () => {
  it('ambiguous', () => {
    const draft = makeDraft({ rows: [makeRow(0, { magnitude: minorUnits(1000), marker: 'none' })] });
    const result = inferProfile(draft, { kind: 'checking', limit: null }, null);
    expect(result.kind).toBe('ambiguous');
  });
});

describe('inferProfile: running balance present on only some rows', () => {
  it('still decisive', () => {
    const draft = makeDraft({
      statedOpening: { magnitude: minorUnits(10000), marker: 'none', asOf: null, raw: '100.00' },
      rows: [
        makeRow(0, { magnitude: minorUnits(1000), marker: 'none', balanceMagnitude: null }),
        makeRow(1, { magnitude: minorUnits(2000), marker: 'none', balanceMagnitude: minorUnits(13000), balanceMarker: 'none' }),
      ],
    });
    const result = inferProfile(draft, { kind: 'checking', limit: null }, null);
    expect(result.kind).toBe('decided');
  });
});

describe('inferProfile: remembered profile', () => {
  it('for this signature+account, file reconciles under it -> decided, decidedBy remembered, evidence [remembered, running-balance]', () => {
    const draft = makeDraft({
      statedOpening: { magnitude: minorUnits(10000), marker: 'none', asOf: null, raw: '100.00' },
      rows: [makeRow(0, { magnitude: minorUnits(2000), marker: 'none', balanceMagnitude: minorUnits(12000), balanceMarker: 'none' })],
    });
    const remembered = makeProfile({ positiveMeans: 'money-in', balanceMeans: 'held', accountFamily: 'deposit', source: 'csv' });
    const result = inferProfile(draft, { kind: 'checking', limit: null }, remembered);
    const { profile, evidence } = asDecided(result);
    expect(profile.decidedBy).toBe('remembered');
    expect(evidence).toEqual(expect.arrayContaining(['remembered', 'running-balance']));
  });

  it('that fails to reconcile a file that has balances -> falls through to normal inference (never silently reapplied)', () => {
    const draft = makeDraft({
      statedOpening: { magnitude: minorUnits(10000), marker: 'none', asOf: null, raw: '100.00' },
      rows: [makeRow(0, { magnitude: minorUnits(2000), marker: 'none', balanceMagnitude: minorUnits(12000), balanceMarker: 'none' })],
    });
    // wrong remembered reading: says money-spent, but the file actually reconciles under money-in
    const remembered = makeProfile({ positiveMeans: 'money-spent', balanceMeans: 'held', accountFamily: 'deposit', source: 'csv' });
    const result = inferProfile(draft, { kind: 'checking', limit: null }, remembered);
    const { profile } = asDecided(result);
    expect(profile.decidedBy).not.toBe('remembered');
    expect(profile.positiveMeans).toBe('money-in');
  });
});

describe('no-leak', () => {
  it('evidence arrays contain only ProfileEvidence codes; JSON never contains fixture descriptions', () => {
    const draft = makeDraft({
      rows: [makeRow(0, { description: 'A SECRET PAYEE NAME 12345', magnitude: minorUnits(1000), marker: 'none' })],
    });
    const result = inferProfile(draft, { kind: 'checking', limit: null }, null);
    const json = JSON.stringify(result);
    expect(json).not.toContain('SECRET PAYEE');
    const knownCodes = [
      'account-kind',
      'debit-credit-columns',
      'direction-column',
      'dr-cr-markers',
      'payment-row-sign',
      'income-row-sign',
      'running-balance',
      'trntype-agrees',
      'available-label',
      'owed-label',
      'remembered',
      'majority-sign-prior',
    ];
    for (const code of result.evidence) {
      expect(knownCodes).toContain(code);
    }
  });
});

describe('property: with balances present, inferProfile recovers s; the mirror reading is never among the candidates', () => {
  it('holds for any generated ledger, target kind, sign and orientation', () => {
    fc.assert(
      fc.property(
        arbLedger(),
        fc.constantFrom<AccountKind>('checking', 'savings', 'cash', 'investment', 'other', 'credit', 'loan'),
        fc.constantFrom<1 | -1>(1, -1),
        fc.constantFrom<'asc' | 'desc'>('asc', 'desc'),
        (ledger, kind, s, orientation) => {
          const balanceMeans = kind === 'credit' || kind === 'loan' ? 'owed' : 'held';
          const draft = renderDraft(ledger, { s, balanceMeans, kind, orientation, withBalances: true });
          const result = inferProfile(draft, { kind, limit: null }, null);
          expect(result.kind).toBe('decided');
          if (result.kind === 'decided') {
            expect(result.profile.positiveMeans).toBe(s === 1 ? 'money-in' : 'money-spent');
          }
        }
      )
    );
  });
});

describe('property: every returned candidate has balanceMeans consistent with the target kind', () => {
  it('no held for credit, no owed for checking', () => {
    fc.assert(
      fc.property(
        arbLedger(),
        fc.constantFrom<AccountKind>('checking', 'savings', 'cash', 'investment', 'other', 'credit', 'loan'),
        fc.constantFrom<1 | -1>(1, -1),
        fc.constantFrom<'asc' | 'desc'>('asc', 'desc'),
        fc.boolean(),
        (ledger, kind, s, orientation, withBalances) => {
          const balanceMeans = kind === 'credit' || kind === 'loan' ? 'owed' : 'held';
          const draft = renderDraft(ledger, { s, balanceMeans, kind, orientation, withBalances });
          const result = inferProfile(draft, { kind, limit: null }, null);
          const profiles = result.kind === 'decided' ? [result.profile] : result.candidates;
          for (const p of profiles) {
            if (kind === 'credit') expect(p.balanceMeans).not.toBe('held');
            if (kind === 'checking' || kind === 'savings' || kind === 'cash') expect(p.balanceMeans).not.toBe('owed');
          }
        }
      )
    );
  });
});
