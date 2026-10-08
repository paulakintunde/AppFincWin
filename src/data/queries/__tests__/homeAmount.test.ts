import { latestPerEur, projectionHomeAmount } from '../homeAmount';
import type { FxLatestRow } from '@/db/rows';

const row = (quote: string, rate: string): FxLatestRow =>
  ({ quote, rate, rate_date: '2026-10-01', source: 'frankfurter-v2' }) as FxLatestRow;

describe('projectionHomeAmount with missing stored rates (02-48)', () => {
  it('returns null when either leg is missing, never an estimate', () => {
    expect(projectionHomeAmount(10000, 'GBP', 'USD', [])).toBeNull();
    expect(projectionHomeAmount(10000, 'GBP', 'USD', [row('USD', '1.1')])).toBeNull();
    expect(projectionHomeAmount(10000, 'GBP', 'USD', [row('GBP', '0.85')])).toBeNull();
  });

  it('needs only the other leg when one side is EUR', () => {
    expect(projectionHomeAmount(10000, 'EUR', 'USD', [row('USD', '1.1')])).not.toBeNull();
    expect(projectionHomeAmount(10000, 'GBP', 'EUR', [row('GBP', '0.85')])).not.toBeNull();
    expect(projectionHomeAmount(10000, 'EUR', 'USD', [])).toBeNull();
  });

  it('converts when both legs are stored', () => {
    expect(projectionHomeAmount(10000, 'GBP', 'USD', [row('GBP', '0.8'), row('USD', '1.2')])).toBe(15000);
  });

  it('treats EUR as 1 with an empty table and unknown codes as null', () => {
    expect(latestPerEur([], 'EUR')).not.toBeNull();
    expect(latestPerEur([], 'GBP')).toBeNull();
  });
});
