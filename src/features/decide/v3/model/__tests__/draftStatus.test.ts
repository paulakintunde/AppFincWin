import { minorUnits } from '@/engine/money';
import { draftStatus, priceProblem } from '../draftStatus';

jest.setTimeout(60000);

describe('draftStatus', () => {
  it('maps the save mutation state', () => {
    expect(draftStatus({ status: 'success' })).toBe('saved');
    expect(draftStatus({ status: 'idle' })).toBe('saved');
    expect(draftStatus({ status: 'pending' })).toBe('saved');
    expect(draftStatus({ status: 'pending', isPaused: true })).toBe('offline');
    expect(draftStatus({ status: 'idle', isPaused: true })).toBe('offline');
    expect(draftStatus({ status: 'error' })).toBe('notSaved');
    expect(draftStatus({ status: 'error', isPaused: false })).toBe('notSaved');
  });
});

describe('priceProblem', () => {
  it('needs a price above zero', () => {
    expect(priceProblem(null)).toBe('priceNeeded');
    expect(priceProblem(minorUnits(0))).toBe('priceNeeded');
    expect(priceProblem(minorUnits(100))).toBeNull();
  });
});
