// 08.1-20 (DCU-10): the stage of the answer on screen, and that its month count is the one count everywhere (06.1-79).
import type { Basis, MonthModel } from '@/engine/decide/v3';
import { recordMonthsOf } from '../recordMonths';
import { stageReadingOf } from '../stageReading';

const UP_TO = '2026-11-09';
const ev = (basis: Basis, months: number, treated: 'steady' | 'variable' = 'steady') => ({
  result: { confidence: { basis } },
  month: {
    monthsUsed: Array.from({ length: months }, (_, i) => `2026-0${i + 1}`),
    incomePicture: { treated, fullMonths: months },
  } as unknown as Pick<MonthModel, 'monthsUsed' | 'incomePicture'>,
});

describe('stageReadingOf', () => {
  it('is null with no evaluation or no basis', () => {
    expect(stageReadingOf(null)).toBeNull();
    expect(stageReadingOf({ result: {} })).toBeNull();
  });

  it('reads the stage from the basis, with the same month count as recordMonthsOf', () => {
    const cases: [ReturnType<typeof ev>, string][] = [
      [ev({ kind: 'quick_estimates' }, 0), 'first_read'],
      [ev({ kind: 'partial', used: 2, lookedFor: 3, upTo: UP_TO }, 2), 'full'],
      [ev({ kind: 'records', months: 4, upTo: UP_TO }, 4), 'deeper'],
      [ev({ kind: 'partial', used: 1, lookedFor: 3, upTo: UP_TO }, 1), 'full'],
    ];
    for (const [e, stage] of cases) {
      const r = stageReadingOf(e);
      expect(r?.stage).toBe(stage);
      expect(r?.monthsUsed).toBe(recordMonthsOf(null, e).used);
    }
  });

  it('works without a month model', () => {
    expect(stageReadingOf({ result: { confidence: { basis: { kind: 'records', months: 3, upTo: UP_TO } } } })?.stage).toBe('deeper');
  });

  it('carries the pay window for a variable earner over a long history', () => {
    const r = stageReadingOf(ev({ kind: 'records', months: 9, upTo: UP_TO }, 9, 'variable'));
    expect(r?.windowUsed.payMonths).toBe(9);
    expect(r?.windowUsed.payWindowLonger).toBe(true);
  });
});
