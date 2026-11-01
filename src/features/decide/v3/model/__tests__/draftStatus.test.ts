import { minorUnits } from '@/engine/money';
import { draftStatus, priceCeiling, priceProblem } from '../draftStatus';

jest.setTimeout(60000);

describe('draftStatus', () => {
  const d = (status: 'idle' | 'pending' | 'success' | 'error', offlinePaused = false, pending = false) => draftStatus({ status, offlinePaused, pending });
  it('maps the save mutation state to four words', () => {
    expect(d('success')).toBe('saved');
    expect(d('idle')).toBe('saved');
    expect(d('pending', false, true)).toBe('saving');
    expect(d('pending', true, true)).toBe('offline');
    expect(d('error')).toBe('notSaved');
  });
});

describe('priceProblem', () => {
  it('needs a price above zero', () => {
    expect(priceProblem(null)).toBe('priceNeeded');
    expect(priceProblem(minorUnits(0))).toBe('priceNeeded');
    expect(priceProblem(minorUnits(100))).toBeNull();
  });
});

describe('priceCeiling and the too-big price', () => {
  const usd = { bandEdges: [minorUnits(1000), minorUnits(500_000_000)] };
  it('is 100 times the top band edge', () => {
    expect(priceCeiling(usd)).toBe(50_000_000_000);
  });
  it('falls back with no band edges', () => {
    expect(priceCeiling({ bandEdges: [] })).toBe(100_000_000_000);
  });
  it('clamps to the amount maximum', () => {
    expect(priceCeiling({ bandEdges: [minorUnits(200_000_000_000)] })).toBe(10_000_000_000_000);
  });
  it('flags a price above the ceiling', () => {
    const c = 50_000_000_000;
    expect(priceProblem(null, c)).toBe('priceNeeded');
    expect(priceProblem(minorUnits(0), c)).toBe('priceNeeded');
    expect(priceProblem(minorUnits(c), c)).toBeNull();
    expect(priceProblem(minorUnits(c + 1), c)).toBe('priceTooBig');
    expect(priceProblem(minorUnits(1_000_000_000_000), c)).toBe('priceTooBig');
  });
});
