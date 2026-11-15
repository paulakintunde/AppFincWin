// 05.5-26: Grow's month breakdown reads the v3 Prepared through the engine's monthRows (rows add up, null when there is nothing to show).
import { monthBreakdown } from '../monthBreakdown';

let mockRows: unknown = null;
jest.mock('@/engine/month', () => ({ monthRows: () => mockRows }));

const prepared = {} as never;

describe('monthBreakdown', () => {
  it('is null with no Prepared', () => {
    expect(monthBreakdown(null)).toBeNull();
  });

  it('is null when the month model has no usual month', () => {
    mockRows = null;
    expect(monthBreakdown(prepared)).toBeNull();
  });

  it('carries the rows through as plain numbers', () => {
    mockRows = { source: 'logged', income: 440_000, spending: 311_000, debts: 19_000, saving: 0, setAside: 0, result: 110_000 };
    const b = monthBreakdown(prepared);
    expect(b).toEqual({ source: 'logged', income: 440_000, spending: 311_000, debts: 19_000, saving: 0, setAside: 0, result: 110_000 });
    expect(b !== null && b.income - b.spending - b.debts - b.saving - b.setAside).toBe(b?.result);
  });
});
