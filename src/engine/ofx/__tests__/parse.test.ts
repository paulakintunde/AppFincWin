/**
 * These five fixtures are SYNTHETIC statements hand-written for this test
 * file only -- invented payees, an invented `ACCTID` ('99887766') and
 * `BANKID` ('000000'). None of them are a real bank export. Any future
 * fixture built from a redacted real statement must be scrubbed of every
 * real account number, name and balance before it is committed, and should
 * be added alongside these, never replacing them.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as ofxBarrel from '../index';
import { parseOfx, type ParseOfxOptions } from '../parse';
import { ofxLocalDate } from '../date';
import { parseOfxAmount } from '../amount';
import { buildOfxTree, child, childText, findAll } from '../tree';
import { splitOfxHeader, tokenizeOfx } from '../tokenize';

function readFixture(name: string): string {
  return fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8');
}

const EXPONENTS: Readonly<Record<string, number>> = { GBP: 2, USD: 2, EUR: 2, JPY: 0 };
const opts: ParseOfxOptions = {
  exponentFor: (code) => (Object.prototype.hasOwnProperty.call(EXPONENTS, code) ? (EXPONENTS[code] as number) : null),
};

function wrap(inner: string): string {
  return `OFXHEADER:100\nDATA:OFXSGML\nVERSION:102\nSECURITY:NONE\nENCODING:USASCII\nCHARSET:1252\n\n<OFX>\n${inner}\n</OFX>\n`;
}

// A minimal single-row bank statement, for the edge-case tests below --
// every field is overridable so each test only states what it varies.
function wrapBankStatement(fields: {
  curDef?: string;
  acctType?: string;
  dtStart?: string;
  dtEnd?: string;
  stmttrn: string;
  extraAfterBankTranList?: string;
}): string {
  const curDef = fields.curDef ?? 'GBP';
  const acctType = fields.acctType ?? 'CHECKING';
  const dtStart = fields.dtStart ?? '20260901';
  const dtEnd = fields.dtEnd ?? '20260910';
  return wrap(`
<BANKMSGSRSV1>
<STMTTRNRS>
<STMTRS>
<CURDEF>${curDef}
<BANKACCTFROM>
<BANKID>000000
<ACCTID>99887766
<ACCTTYPE>${acctType}
</BANKACCTFROM>
<BANKTRANLIST>
<DTSTART>${dtStart}
<DTEND>${dtEnd}
${fields.stmttrn}
</BANKTRANLIST>
${fields.extraAfterBankTranList ?? ''}
</STMTRS>
</STMTTRNRS>
</BANKMSGSRSV1>
`);
}

describe('parseOfx: golden fixtures', () => {
  it('bank-sgml.ofx: one draft with 5 rows, balances, and a bank layout signature', () => {
    const result = parseOfx(readFixture('bank-sgml.ofx'), opts);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.drafts).toHaveLength(1);
    const draft = result.drafts[0]!;
    expect(draft.source).toBe('ofx');
    expect(draft.accountHint).toBe('bank');
    expect(draft.currency).toBe('GBP');
    expect(draft.layoutSignature).toBe('ofx|bank|CHECKING');
    expect(draft.periodStart).toBe('2026-09-01');
    expect(draft.periodEnd).toBe('2026-09-12');
    expect(draft.rows).toHaveLength(5);

    expect(draft.rows[0]).toMatchObject({
      localDate: '2026-09-01',
      description: 'TESCO STORES · GROCERIES',
      magnitude: 4500,
      marker: 'minus',
      externalId: 'SYN0001',
      trnType: 'DEBIT',
      currency: 'GBP',
      issues: [],
    });
    expect(draft.rows[1]).toMatchObject({
      description: 'COSTA COFFEE',
      magnitude: 1250,
      marker: 'minus',
      externalId: 'SYN0002',
      issues: [],
    });
    expect(draft.rows[2]).toMatchObject({
      description: 'ACME LTD · SALARY',
      magnitude: 150000,
      marker: 'plus',
      externalId: 'SYN0003',
      trnType: 'CREDIT',
      issues: [],
    });
    expect(draft.rows[3]).toMatchObject({
      description: 'RENT PAYMENT',
      magnitude: 30000,
      marker: 'minus',
      externalId: 'SYN0004',
      issues: [],
    });
    expect(draft.rows[4]).toMatchObject({
      description: 'ZERO FEE ADJUSTMENT',
      magnitude: 0,
      marker: 'minus',
      externalId: 'SYN0005',
      issues: ['zero-amount'],
    });

    expect(draft.statedClosing).toEqual({ magnitude: 24000, marker: 'minus', asOf: '2026-09-12', raw: '-240.00' });
    expect(draft.available).toEqual({ magnitude: 26000, marker: 'none', asOf: '2026-09-12', raw: '260.00' });
    expect(draft.statedOpening).toBeNull();
    expect(draft.statedLimit).toBeNull();
  });

  it('card-sgml-positive-purchases.qfx: card hint, positive purchases, a negative payment, INTU tags ignored', () => {
    const result = parseOfx(readFixture('card-sgml-positive-purchases.qfx'), opts);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.drafts).toHaveLength(1);
    const draft = result.drafts[0]!;
    expect(draft.accountHint).toBe('card');
    expect(draft.layoutSignature).toBe('ofx|card');
    expect(draft.currency).toBe('GBP');
    expect(draft.rows).toHaveLength(3);

    expect(draft.rows[0]).toMatchObject({ description: 'JOHN LEWIS', magnitude: 6500, marker: 'none' });
    expect(draft.rows[1]).toMatchObject({ description: 'AMAZON MARKETPLACE', magnitude: 2250, marker: 'none' });
    expect(draft.rows[2]).toMatchObject({ description: 'PAYMENT - THANK YOU', magnitude: 20000, marker: 'minus' });

    expect(draft.statedClosing).toEqual({ magnitude: 45000, marker: 'none', asOf: '2026-09-12', raw: '450.00' });
    expect(draft.available).toEqual({ magnitude: 55000, marker: 'none', asOf: '2026-09-12', raw: '550.00' });
  });

  it('bank-xml-220.ofx: the OFX 2.x XML rendition produces the same draft shape as the SGML equivalent', () => {
    const sgmlResult = parseOfx(readFixture('bank-sgml.ofx'), opts);
    const xmlResult = parseOfx(readFixture('bank-xml-220.ofx'), opts);
    expect(sgmlResult.ok).toBe(true);
    expect(xmlResult.ok).toBe(true);
    if (!sgmlResult.ok || !xmlResult.ok) return;

    expect(xmlResult.drafts).toEqual(sgmlResult.drafts);
  });

  it('multi-statement.ofx: one STMTRS then one CCSTMTRS produce 2 drafts in document order', () => {
    const result = parseOfx(readFixture('multi-statement.ofx'), opts);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.drafts).toHaveLength(2);
    const [bank, card] = result.drafts;

    expect(bank!.accountHint).toBe('bank');
    expect(bank!.layoutSignature).toBe('ofx|bank|SAVINGS');
    expect(bank!.rows).toHaveLength(2);
    expect(bank!.rows[0]).toMatchObject({ description: 'INTEREST PAID', magnitude: 10000, marker: 'plus' });
    expect(bank!.rows[1]).toMatchObject({ description: 'TRANSFER OUT', magnitude: 2500, marker: 'minus' });
    expect(bank!.statedClosing).toEqual({ magnitude: 107500, marker: 'none', asOf: '2026-09-10', raw: '1075.00' });

    expect(card!.accountHint).toBe('card');
    expect(card!.layoutSignature).toBe('ofx|card');
    expect(card!.rows).toHaveLength(2);
    expect(card!.rows[0]).toMatchObject({ description: 'PETROL STATION', magnitude: 4000, marker: 'none' });
    expect(card!.rows[1]).toMatchObject({ description: 'PAYMENT - THANK YOU', magnitude: 10000, marker: 'minus' });
    expect(card!.statedClosing).toEqual({ magnitude: 30000, marker: 'none', asOf: '2026-09-10', raw: '300.00' });
  });

  it('card-over-limit.ofx: a negative LEDGERBAL and a negative AVAILBAL both read as owed-side minus', () => {
    const result = parseOfx(readFixture('card-over-limit.ofx'), opts);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const draft = result.drafts[0]!;
    expect(draft.statedClosing).toEqual({ magnitude: 125000, marker: 'minus', asOf: '2026-09-12', raw: '-1250.00' });
    expect(draft.available).toEqual({ magnitude: 25000, marker: 'minus', asOf: '2026-09-12', raw: '-250.00' });
  });

  it('never mentions ACCTID or the fixtures\' own account number anywhere in the result', () => {
    for (const name of [
      'bank-sgml.ofx',
      'card-sgml-positive-purchases.qfx',
      'bank-xml-220.ofx',
      'multi-statement.ofx',
      'card-over-limit.ofx',
    ]) {
      const result = parseOfx(readFixture(name), opts);
      expect(result.ok).toBe(true);
      const json = JSON.stringify(result);
      expect(json).not.toContain('ACCTID');
      expect(json).not.toContain('99887766');
      expect(json).not.toContain('99887799');
      expect(json).not.toContain('000000');
    }
  });
});

describe('parseOfx: unsupported and empty files', () => {
  it('an investment-only file returns unsupported-statement', () => {
    const text = wrap(
      '<INVSTMTMSGSRSV1><INVSTMTTRNRS><INVSTMTRS><CURDEF>USD</INVSTMTRS></INVSTMTTRNRS></INVSTMTMSGSRSV1>'
    );
    expect(parseOfx(text, opts)).toEqual({ ok: false, error: 'unsupported-statement' });
  });

  it('a loan-only file returns unsupported-statement', () => {
    const text = wrap('<LOANMSGSRSV1><LOANTRNRS><LOANSTMTRS><CURDEF>USD</LOANSTMTRS></LOANTRNRS></LOANMSGSRSV1>');
    expect(parseOfx(text, opts)).toEqual({ ok: false, error: 'unsupported-statement' });
  });

  it('a file with no statement of any kind returns no-statements', () => {
    const text = wrap(
      '<SIGNONMSGSRSV1><SONRS><STATUS><CODE>0<SEVERITY>INFO</STATUS></SONRS></SIGNONMSGSRSV1>'
    );
    expect(parseOfx(text, opts)).toEqual({ ok: false, error: 'no-statements' });
  });
});

describe('parseOfx: tokenizer/tree errors pass through unchanged', () => {
  it('no-ofx-root: text with no <OFX> root', () => {
    expect(parseOfx('hello, this is not a statement file at all', opts)).toEqual({
      ok: false,
      error: 'no-ofx-root',
    });
  });

  it('too-large: a body over the 5 MB budget', () => {
    const huge = 'OFXHEADER:100\n\n<OFX>' + 'A'.repeat(6 * 1024 * 1024) + '</OFX>';
    expect(parseOfx(huge, opts)).toEqual({ ok: false, error: 'too-large' });
  });

  it('too-deep: an aggregate nesting past the 64-deep budget', () => {
    const text = 'OFXHEADER:100\n\n<OFX>' + '<A>'.repeat(70) + 'X' + '</A>'.repeat(70) + '</OFX>';
    expect(parseOfx(text, opts)).toEqual({ ok: false, error: 'too-deep' });
  });
});

describe('parseOfx: description assembly', () => {
  it('appends MEMO with " · " when it adds text not already in NAME', () => {
    const text = wrapBankStatement({
      stmttrn:
        '<STMTTRN>\n<TRNTYPE>DEBIT\n<DTPOSTED>20260902000000[0:GMT]\n<TRNAMT>-10.00\n<FITID>D1\n<NAME>SHOP A\n<MEMO>WEEKLY GROCERIES\n</STMTTRN>',
    });
    const result = parseOfx(text, opts);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.drafts[0]!.rows[0]!.description).toBe('SHOP A · WEEKLY GROCERIES');
  });

  it('uses NAME alone when there is no MEMO', () => {
    const text = wrapBankStatement({
      stmttrn: '<STMTTRN>\n<TRNTYPE>DEBIT\n<DTPOSTED>20260902000000[0:GMT]\n<TRNAMT>-10.00\n<FITID>D2\n<NAME>SHOP B\n</STMTTRN>',
    });
    const result = parseOfx(text, opts);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.drafts[0]!.rows[0]!.description).toBe('SHOP B');
  });

  it('does not duplicate MEMO text already contained in NAME', () => {
    const text = wrapBankStatement({
      stmttrn:
        '<STMTTRN>\n<TRNTYPE>DEBIT\n<DTPOSTED>20260902000000[0:GMT]\n<TRNAMT>-10.00\n<FITID>D3\n<NAME>SHOP C GROCERIES\n<MEMO>GROCERIES\n</STMTTRN>',
    });
    const result = parseOfx(text, opts);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.drafts[0]!.rows[0]!.description).toBe('SHOP C GROCERIES');
  });

  it('falls back to PAYEE/NAME when NAME itself is absent', () => {
    const text = wrapBankStatement({
      stmttrn:
        '<STMTTRN>\n<TRNTYPE>DEBIT\n<DTPOSTED>20260902000000[0:GMT]\n<TRNAMT>-10.00\n<FITID>D4\n<PAYEE>\n<NAME>SHOP VIA PAYEE\n</PAYEE>\n</STMTTRN>',
    });
    const result = parseOfx(text, opts);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.drafts[0]!.rows[0]!.description).toBe('SHOP VIA PAYEE');
  });

  it('collapses internal whitespace runs to a single space', () => {
    const text = wrapBankStatement({
      stmttrn:
        '<STMTTRN>\n<TRNTYPE>DEBIT\n<DTPOSTED>20260902000000[0:GMT]\n<TRNAMT>-10.00\n<FITID>D5\n<NAME>SHOP    WITH   SPACES\n</STMTTRN>',
    });
    const result = parseOfx(text, opts);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.drafts[0]!.rows[0]!.description).toBe('SHOP WITH SPACES');
  });

  it('truncates a combined description to 200 characters', () => {
    const longName = 'N'.repeat(150);
    const longMemo = 'M'.repeat(150);
    const text = wrapBankStatement({
      stmttrn: `<STMTTRN>\n<TRNTYPE>DEBIT\n<DTPOSTED>20260902000000[0:GMT]\n<TRNAMT>-10.00\n<FITID>D6\n<NAME>${longName}\n<MEMO>${longMemo}\n</STMTTRN>`,
    });
    const result = parseOfx(text, opts);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const description = result.drafts[0]!.rows[0]!.description;
      expect(description.length).toBe(200);
      expect(description.startsWith(longName)).toBe(true);
    }
  });

  it('falls back to MEMO alone when NAME (and PAYEE/NAME) are both absent', () => {
    const text = wrapBankStatement({
      stmttrn: '<STMTTRN>\n<TRNTYPE>DEBIT\n<DTPOSTED>20260902000000[0:GMT]\n<TRNAMT>-10.00\n<FITID>D8\n<MEMO>MEMO ONLY ROW\n</STMTTRN>',
    });
    const result = parseOfx(text, opts);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.drafts[0]!.rows[0]!.description).toBe('MEMO ONLY ROW');
  });

  it('gets the empty-description issue when NAME and MEMO are both absent', () => {
    const text = wrapBankStatement({
      stmttrn: '<STMTTRN>\n<TRNTYPE>DEBIT\n<DTPOSTED>20260902000000[0:GMT]\n<TRNAMT>-10.00\n<FITID>D7\n</STMTTRN>',
    });
    const result = parseOfx(text, opts);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.drafts[0]!.rows[0]!.description).toBe('');
      expect(result.drafts[0]!.rows[0]!.issues).toContain('empty-description');
    }
  });
});

describe('parseOfx: empty SGML leaves (review E-WR-04)', () => {
  it('an empty DTUSER or NAME never hides the TRNAMT, FITID or MEMO that follow it', () => {
    const result = parseOfx(
      wrapBankStatement({
        stmttrn: '<STMTTRN>\n<TRNTYPE>DEBIT\n<DTPOSTED>20260905\n<DTUSER>\n<TRNAMT>-45.00\n<NAME>\n<FITID>F-9\n<MEMO>CARD 1234 TESCO\n</STMTTRN>',
      }),
      opts
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const row = result.drafts[0]!.rows[0]!;
    expect(row.magnitude).toBe(4500);
    expect(row.marker).toBe('minus');
    expect(row.externalId).toBe('F-9');
    expect(row.description).toBe('CARD 1234 TESCO');
    expect(row.issues).toEqual([]);
  });
});

describe('parseOfx: row issues', () => {
  it('a malformed DTPOSTED gets localDate null and the bad-date issue', () => {
    const text = wrapBankStatement({
      stmttrn:
        '<STMTTRN>\n<TRNTYPE>DEBIT\n<DTPOSTED>20261332\n<TRNAMT>-10.00\n<FITID>E1\n<NAME>BAD DATE ROW\n</STMTTRN>',
    });
    const result = parseOfx(text, opts);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const row = result.drafts[0]!.rows[0]!;
      expect(row.localDate).toBeNull();
      expect(row.issues).toContain('bad-date');
    }
  });

  it('a missing DTPOSTED also yields localDate null and bad-date', () => {
    const text = wrapBankStatement({
      stmttrn: '<STMTTRN>\n<TRNTYPE>DEBIT\n<TRNAMT>-10.00\n<FITID>E2\n<NAME>NO DATE ROW\n</STMTTRN>',
    });
    const result = parseOfx(text, opts);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const row = result.drafts[0]!.rows[0]!;
      expect(row.localDate).toBeNull();
      expect(row.issues).toContain('bad-date');
    }
  });

  it('an unparseable TRNAMT gets magnitude null and the bad-amount issue', () => {
    const text = wrapBankStatement({
      stmttrn:
        '<STMTTRN>\n<TRNTYPE>DEBIT\n<DTPOSTED>20260902000000[0:GMT]\n<TRNAMT>not-a-number\n<FITID>E3\n<NAME>BAD AMOUNT ROW\n</STMTTRN>',
    });
    const result = parseOfx(text, opts);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const row = result.drafts[0]!.rows[0]!;
      expect(row.magnitude).toBeNull();
      expect(row.marker).toBe('none');
      expect(row.issues).toContain('bad-amount');
    }
  });

  it('an amount over the MAX_ABS_AMOUNT_MINOR bound gets the amount-too-large issue', () => {
    const text = wrapBankStatement({
      stmttrn:
        '<STMTTRN>\n<TRNTYPE>DEBIT\n<DTPOSTED>20260902000000[0:GMT]\n<TRNAMT>-999999999999.00\n<FITID>E4\n<NAME>HUGE AMOUNT ROW\n</STMTTRN>',
    });
    const result = parseOfx(text, opts);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const row = result.drafts[0]!.rows[0]!;
      expect(row.magnitude).toBeNull();
      expect(row.issues).toContain('amount-too-large');
    }
  });

  it('a missing TRNAMT gets magnitude null and the bad-amount issue', () => {
    const text = wrapBankStatement({
      stmttrn: '<STMTTRN>\n<TRNTYPE>DEBIT\n<DTPOSTED>20260902000000[0:GMT]\n<FITID>E5\n<NAME>NO AMOUNT ROW\n</STMTTRN>',
    });
    const result = parseOfx(text, opts);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const row = result.drafts[0]!.rows[0]!;
      expect(row.magnitude).toBeNull();
      expect(row.rawAmount).toBeNull();
      expect(row.issues).toContain('bad-amount');
    }
  });

  it('a missing FITID and TRNTYPE leave both fields null without an issue', () => {
    const text = wrapBankStatement({
      stmttrn:
        '<STMTTRN>\n<DTPOSTED>20260902000000[0:GMT]\n<TRNAMT>-10.00\n<NAME>NO METADATA ROW\n</STMTTRN>',
    });
    const result = parseOfx(text, opts);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const row = result.drafts[0]!.rows[0]!;
      expect(row.externalId).toBeNull();
      expect(row.trnType).toBeNull();
    }
  });
});

describe('parseOfx: currency handling', () => {
  it('an unknown CURDEF flags every row unknown-currency and keeps the CURDEF text as the currency', () => {
    const text = wrapBankStatement({
      curDef: 'ZZZ',
      stmttrn:
        '<STMTTRN>\n<TRNTYPE>DEBIT\n<DTPOSTED>20260902000000[0:GMT]\n<TRNAMT>-10.00\n<FITID>F1\n<NAME>FOREIGN ROW ONE\n</STMTTRN>\n' +
        '<STMTTRN>\n<TRNTYPE>DEBIT\n<DTPOSTED>20260903000000[0:GMT]\n<TRNAMT>-20.00\n<FITID>F2\n<NAME>FOREIGN ROW TWO\n</STMTTRN>',
    });
    const result = parseOfx(text, opts);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const draft = result.drafts[0]!;
      expect(draft.currency).toBe('ZZZ');
      for (const row of draft.rows) {
        expect(row.currency).toBe('ZZZ');
        expect(row.issues).toContain('unknown-currency');
      }
    }
  });

  it('a per-row CURRENCY aggregate never changes the row currency away from CURDEF', () => {
    const text = wrapBankStatement({
      stmttrn:
        '<STMTTRN>\n<TRNTYPE>DEBIT\n<DTPOSTED>20260902000000[0:GMT]\n<TRNAMT>-10.00\n<FITID>F3\n<NAME>FOREIGN PURCHASE\n<CURRENCY>\n<CURRATE>1.2\n<CURSYM>USD\n</CURRENCY>\n</STMTTRN>',
    });
    const result = parseOfx(text, opts);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const row = result.drafts[0]!.rows[0]!;
      expect(row.currency).toBe('GBP');
      expect(row.issues).not.toContain('unknown-currency');
    }
  });
});

describe('parseOfx: every optional field absent', () => {
  it('a statement missing CURDEF, BANKACCTFROM, BANKTRANLIST, LEDGERBAL and AVAILBAL still parses', () => {
    const text = wrap(`
<BANKMSGSRSV1>
<STMTTRNRS>
<STMTRS>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20260902000000[0:GMT]
<TRNAMT>-10.00
<FITID>MIN0001
<NAME>MINIMAL ROW
</STMTTRN>
</STMTRS>
</STMTTRNRS>
</BANKMSGSRSV1>
`);
    const result = parseOfx(text, opts);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const draft = result.drafts[0]!;
    expect(draft.currency).toBeNull();
    expect(draft.layoutSignature).toBe('ofx|bank');
    expect(draft.periodStart).toBeNull();
    expect(draft.periodEnd).toBeNull();
    expect(draft.statedClosing).toBeNull();
    expect(draft.available).toBeNull();
    expect(draft.rows).toHaveLength(1);
    expect(draft.rows[0]!.currency).toBe('');
    expect(draft.rows[0]!.issues).toEqual(['unknown-currency']);
  });

  it('a LEDGERBAL with no BALAMT child reads as null, not a crash', () => {
    const text = wrapBankStatement({
      stmttrn: '<STMTTRN>\n<TRNTYPE>DEBIT\n<DTPOSTED>20260902000000[0:GMT]\n<TRNAMT>-10.00\n<FITID>H1\n<NAME>ROW H1\n</STMTTRN>',
      extraAfterBankTranList: '<LEDGERBAL>\n<DTASOF>20260912120000[0:GMT]\n</LEDGERBAL>',
    });
    const result = parseOfx(text, opts);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.drafts[0]!.statedClosing).toBeNull();
  });

  it('a LEDGERBAL with an unparseable BALAMT reads as null, not a crash', () => {
    const text = wrapBankStatement({
      stmttrn: '<STMTTRN>\n<TRNTYPE>DEBIT\n<DTPOSTED>20260902000000[0:GMT]\n<TRNAMT>-10.00\n<FITID>H2\n<NAME>ROW H2\n</STMTTRN>',
      extraAfterBankTranList: '<LEDGERBAL>\n<BALAMT>not-a-number\n<DTASOF>20260912120000[0:GMT]\n</LEDGERBAL>',
    });
    const result = parseOfx(text, opts);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.drafts[0]!.statedClosing).toBeNull();
  });

  it('a LEDGERBAL with no DTASOF still reads its amount, with asOf null', () => {
    const text = wrapBankStatement({
      stmttrn: '<STMTTRN>\n<TRNTYPE>DEBIT\n<DTPOSTED>20260902000000[0:GMT]\n<TRNAMT>-10.00\n<FITID>H3\n<NAME>ROW H3\n</STMTTRN>',
      extraAfterBankTranList: '<LEDGERBAL>\n<BALAMT>100.00\n</LEDGERBAL>',
    });
    const result = parseOfx(text, opts);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.drafts[0]!.statedClosing).toEqual({ magnitude: 10000, marker: 'none', asOf: null, raw: '100.00' });
    }
  });
});

describe('parseOfx: warnings', () => {
  it('a stray closing tag is a malformed-close tree warning copied onto every draft', () => {
    const text = wrapBankStatement({
      stmttrn: '<STMTTRN>\n<TRNTYPE>DEBIT\n<DTPOSTED>20260902000000[0:GMT]\n<TRNAMT>-10.00\n<FITID>G1\n<NAME>ROW A\n</STMTTRN>',
      extraAfterBankTranList: '</BOGUS>',
    });
    const result = parseOfx(text, opts);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.drafts[0]!.warnings).toContain('malformed-close');
  });
});

describe('parseOfx: no-leak', () => {
  it("a TRNAMT of 'TESCO 12.50', a NAME of 'DR JONES PHARMACY' and a stray close never leak into issues or warnings", () => {
    const text = wrapBankStatement({
      stmttrn:
        '<STMTTRN>\n<TRNTYPE>DEBIT\n<DTPOSTED>20260903000000[0:GMT]\n<TRNAMT>TESCO 12.50\n<FITID>LEAK0001\n<NAME>DR JONES PHARMACY\n</STMTTRN>',
      extraAfterBankTranList: '</BOGUS>',
    });
    const result = parseOfx(text, opts);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // The description field is explicitly allowed to carry the payee text --
    // only the enum-code issues/warnings arrays carry the no-leak guarantee.
    const issuesAndWarnings = JSON.stringify({
      warnings: result.drafts.flatMap((d) => d.warnings),
      issues: result.drafts.flatMap((d) => d.rows.flatMap((r) => r.issues)),
    });
    expect(issuesAndWarnings).not.toContain('TESCO');
    expect(issuesAndWarnings).not.toContain('JONES');

    const row = result.drafts[0]!;
    expect(row.rows[0]!.issues).toContain('bad-amount');
    expect(row.warnings).toContain('malformed-close');
  });
});

describe('barrel', () => {
  it('re-exports ofxLocalDate, parseOfxAmount and parseOfx alongside the 02-33 tokenizer/tree exports', () => {
    expect(ofxBarrel.ofxLocalDate).toBe(ofxLocalDate);
    expect(ofxBarrel.parseOfxAmount).toBe(parseOfxAmount);
    expect(ofxBarrel.parseOfx).toBe(parseOfx);
    expect(ofxBarrel.buildOfxTree).toBe(buildOfxTree);
    expect(ofxBarrel.findAll).toBe(findAll);
    expect(ofxBarrel.child).toBe(child);
    expect(ofxBarrel.childText).toBe(childText);
    expect(ofxBarrel.splitOfxHeader).toBe(splitOfxHeader);
    expect(ofxBarrel.tokenizeOfx).toBe(tokenizeOfx);
  });
});
