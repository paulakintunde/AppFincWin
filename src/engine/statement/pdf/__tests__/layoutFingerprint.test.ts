import { buildLayoutFingerprint, pageBand } from '../layoutFingerprint';

describe('pageBand', () => {
  it.each([
    [1, '1'],
    [2, '2-5'],
    [5, '2-5'],
    [6, '6-10'],
    [10, '6-10'],
    [11, '11-25'],
    [25, '11-25'],
  ] as const)('%i -> %s', (n, band) => {
    expect(pageBand(n)).toBe(band);
  });
});

describe('buildLayoutFingerprint', () => {
  it('reports which column roles were found and nothing else', () => {
    const f = buildLayoutFingerprint({ failedStep: 'no_rows', pageCount: 3, roles: ['date', 'description', 'debit', 'credit', 'balance'] });
    expect(f).toEqual({ failedStep: 'no_rows', pages: '2-5', hasDate: true, hasDescription: true, hasAmount: false, hasDebitCredit: true, hasBalance: true });
    expect(Object.keys(f).sort()).toEqual(['failedStep', 'hasAmount', 'hasBalance', 'hasDate', 'hasDebitCredit', 'hasDescription', 'pages']);
  });

  it('handles no roles, an amount column and one-sided debit', () => {
    expect(buildLayoutFingerprint({ failedStep: 'no_table', pageCount: 1, roles: [] })).toEqual({
      failedStep: 'no_table',
      pages: '1',
      hasDate: false,
      hasDescription: false,
      hasAmount: false,
      hasDebitCredit: false,
      hasBalance: false,
    });
    expect(buildLayoutFingerprint({ failedStep: 'no_text_layer', pageCount: 12, roles: ['amount', 'debit', 'other'] })).toMatchObject({
      hasAmount: true,
      hasDebitCredit: false,
      pages: '11-25',
    });
  });
});
