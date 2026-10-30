import { factRows } from '../factRows';

jest.setTimeout(60000);

const res = (facts: { code: string; values: Record<string, unknown> }[], extra: Record<string, unknown> = {}) =>
  ({ code: 'fits_month', facts, readyBy: null, ...extra }) as never;

describe('factRows', () => {
  it('month_left_after is a figure row, negative when below zero', () => {
    expect(factRows(res([{ code: 'month_left_after', values: { month: '2026-10', left: 5000 } }]))).toEqual([
      { kind: 'figure', labelKey: 'decide.v3.ui.factRow.monthLeftAfter', labelParams: { month: '2026-10' }, figure: 5000, negative: false },
    ]);
    expect(factRows(res([{ code: 'month_left_after', values: { month: '2026-10', left: -5 } }]))[0]!.negative).toBe(true);
    expect(factRows(res([{ code: 'month_left_after', values: { month: '2026-10' } }]))[0]!.figure).toBe(0);
  });

  it('unspent, emergency, envelope and held-back figure rows', () => {
    const rows = factRows(
      res([
        { code: 'unspent_before_after', values: { before: 90000, after: 40000 } },
        { code: 'emergency_untouched', values: { amount: 500000 } },
        { code: 'envelope_used', values: { used: 3000, envelopeId: 'e1' } },
        { code: 'unspent_held_back', values: { amount: 7000 } },
      ])
    );
    expect(rows[0]).toMatchObject({ kind: 'figure', labelKey: 'decide.v3.ui.factRow.unspent', figure: 40000, subKey: 'decide.v3.ui.factRow.unspentFrom', subParams: { before: 90000 } });
    expect(rows[1]).toMatchObject({ labelKey: 'decide.v3.ui.factRow.emergencyUntouched', figure: 500000 });
    expect(rows[2]).toMatchObject({ labelKey: 'decide.v3.ui.factRow.envelopeUsed', labelParams: { envelopeId: 'e1' }, figure: 3000 });
    expect(rows[3]).toMatchObject({ labelKey: 'decide.v3.ui.factRow.unspentHeldBack', figure: 7000 });
    expect(factRows(res([{ code: 'unspent_before_after', values: {} }]))[0]!.subParams).toEqual({ before: 0 });
    expect(factRows(res([{ code: 'envelope_used', values: { used: 1 } }]))[0]!.labelParams).toEqual({ envelopeId: '' });
  });

  it('emergency_used shows the rebuild time only when known', () => {
    expect(factRows(res([{ code: 'emergency_used', values: { used: 2000, months: 4 } }]))[0]).toMatchObject({
      labelKey: 'decide.v3.ui.factRow.emergencyUsed',
      figure: 2000,
      subKey: 'decide.v3.ui.factRow.rebuild',
      subParams: { months: 4 },
    });
    expect(factRows(res([{ code: 'emergency_used', values: { used: 2000 } }]))[0]!.subKey).toBeUndefined();
  });

  it('low_month is a figure row with the monthly payment beneath', () => {
    expect(factRows(res([{ code: 'low_month', values: { month: '2026-05', left: -300, monthly: 9000 } }]))[0]).toEqual({
      kind: 'figure',
      labelKey: 'decide.v3.ui.factRow.lowMonth',
      labelParams: { month: '2026-05' },
      figure: -300,
      negative: true,
      subKey: 'decide.v3.ui.factRow.lowMonthMonthly',
      subParams: { monthly: 9000 },
    });
    expect(factRows(res([{ code: 'low_month', values: { month: '2026-05' } }]))[0]).toMatchObject({ negative: false, subParams: { monthly: 0 } });
  });

  it('other facts are sentences in engine order, through factCopy', () => {
    const rows = factRows(
      res([
        { code: 'line_crossed', values: { lineId: 'l', kind: 'k', unit: 'percent', value: 40, limit: 30 } },
        { code: 'quoted_differs', values: { quoted: 100, computed: 120 } },
        { code: 'implied_rate', values: { rate: '9999' } },
        { code: 'month_left_after', values: { month: '2026-10', left: 1 } },
      ])
    );
    expect(rows.map((r) => r.kind)).toEqual(['sentence', 'sentence', 'sentence', 'figure']);
    expect(rows[0]).toMatchObject({ labelKey: 'decide.v3.fact.line_crossed_percent', labelParams: { value: 40, limit: 30 } });
    expect(rows[0]!.tone).toBeUndefined();
    expect(rows[1]).toMatchObject({ labelKey: 'decide.v3.fact.quoted_differs', tone: 'warn' });
    expect(rows[2]).toMatchObject({ labelKey: 'decide.v3.fact.implied_rate_over', labelParams: { rate: '999' } });
  });

  it('not_yet with a ready-by adds a covered-by row at the end', () => {
    const month = factRows(res([{ code: 'month_left_after', values: { month: '2026-10', left: 1 } }], { code: 'not_yet', readyBy: { kind: 'month', month: '2027-02' } }));
    expect(month[1]).toEqual({ kind: 'coveredBy', labelKey: 'decide.v3.ui.answer.coveredBy', labelParams: { month: '2027-02' } });
    const date = factRows(res([], { code: 'not_yet', readyBy: { kind: 'date', date: '2027-02-03' } }));
    expect(date[0]!.labelParams).toEqual({ date: '2027-02-03' });
    expect(factRows(res([], { code: 'fits_month', readyBy: { kind: 'month', month: '2027-02' } }))).toEqual([]);
    expect(factRows(res([], { code: 'not_yet', readyBy: null }))).toEqual([]);
  });
});
