import fc from 'fast-check';
import { accountDeleteState } from '../deletable';

describe('accountDeleteState', () => {
  it('maps cases', () => {
    expect(accountDeleteState({ liveLineCount: 0, activeSeriesCount: 0 })).toEqual({
      kind: 'delete',
    });
    expect(accountDeleteState({ liveLineCount: 3, activeSeriesCount: 0 })).toEqual({
      kind: 'archive',
      reason: 'lines',
      lineCount: 3,
    });
    expect(accountDeleteState({ liveLineCount: 0, activeSeriesCount: 1 })).toEqual({
      kind: 'archive',
      reason: 'series',
      lineCount: 0,
    });
    expect(accountDeleteState({ liveLineCount: 2, activeSeriesCount: 1 })).toEqual({
      kind: 'archive',
      reason: 'both',
      lineCount: 2,
    });
  });
  it('rejects bad counts', () => {
    expect(() => accountDeleteState({ liveLineCount: -1, activeSeriesCount: 0 })).toThrow(
      RangeError,
    );
    expect(() => accountDeleteState({ liveLineCount: 0, activeSeriesCount: 1.5 })).toThrow(
      RangeError,
    );
  });
  it('property: delete iff both zero', () => {
    fc.assert(
      fc.property(fc.nat(5), fc.nat(5), (l, s) => {
        const k = accountDeleteState({ liveLineCount: l, activeSeriesCount: s }).kind;
        expect(k === 'delete').toBe(l === 0 && s === 0);
      }),
    );
  });
});
