import {
  DURATION_MAX,
  HORIZON_MAX,
  acceptsMonthsKeystroke,
  cheaperBounds,
  cheaperThumbPercent,
  parseWholeInRange,
  pinToTrack,
  presetFor,
  waitAmountForMonths,
  waitMonthsFor,
  waitSliderBounds,
  waitTypedBounds,
} from '../customValues';

describe('customValues', () => {
  it('D-71 months parse as whole numbers from 1 to 120', () => {
    expect(DURATION_MAX).toBe(120);
    expect(HORIZON_MAX).toBe(600);
    expect(parseWholeInRange('', 1, 120)).toEqual({ kind: 'empty' });
    expect(parseWholeInRange('1.5', 1, 120)).toEqual({ kind: 'invalid' });
    expect(parseWholeInRange('1,5', 1, 120)).toEqual({ kind: 'invalid' });
    expect(parseWholeInRange('-3', 1, 120)).toEqual({ kind: 'invalid' });
    expect(parseWholeInRange('0', 1, 120)).toEqual({ kind: 'out_of_range' });
    expect(parseWholeInRange('121', 1, 120)).toEqual({ kind: 'out_of_range' });
    expect(parseWholeInRange('99999999999999999999', 1, 120)).toEqual({ kind: 'out_of_range' });
    expect(parseWholeInRange('1', 1, 120)).toEqual({ kind: 'ok', value: 1 });
    expect(parseWholeInRange('120', 1, 120)).toEqual({ kind: 'ok', value: 120 });
    expect(parseWholeInRange('600', 1, 600)).toEqual({ kind: 'ok', value: 600 });
    expect(acceptsMonthsKeystroke('')).toBe(true);
    expect(acceptsMonthsKeystroke('12')).toBe(true);
    expect(acceptsMonthsKeystroke('1.')).toBe(false);
    expect(acceptsMonthsKeystroke('a')).toBe(false);
  });

  it('presetFor finds the equal preset', () => {
    expect(presetFor(12, [6, 12, 24])).toBe(12);
    expect(presetFor(13, [6, 12, 24])).toBeNull();
    expect(presetFor(null, [6, 12, 24])).toBeNull();
  });

  it('D-71 Ready in N months is target over N rounded up to the cent', () => {
    expect(waitAmountForMonths(145_000, 12)).toBe(12_084);
    expect(waitAmountForMonths(144_000, 12)).toBe(12_000);
    expect(waitAmountForMonths(0, 5)).toBe(0);
    expect(waitAmountForMonths(100, 1)).toBe(100);
    expect(waitAmountForMonths(100, 120)).toBe(1);
    expect(() => waitAmountForMonths(100, 0)).toThrow(RangeError);
    expect(() => waitAmountForMonths(100, 121)).toThrow(RangeError);
    expect(() => waitAmountForMonths(100, 1.5)).toThrow(RangeError);
    expect(waitMonthsFor(145_000, 12_084)).toBe(12);
    expect(waitMonthsFor(145_000, 12_083)).toBe(13);
    expect(waitMonthsFor(145_000, 200_000)).toBe(1);
    expect(waitMonthsFor(0, 500)).toBe(0);
    expect(waitMonthsFor(145_000, 0)).toBeNull();
    expect(waitMonthsFor(145_000, -5)).toBeNull();
  });

  it('D-71 the Wait typed range runs from ceil(target over 120) to the target', () => {
    expect(waitTypedBounds(145_000)).toEqual({ min: 1_209, max: 145_000 });
    expect(waitTypedBounds(120_000)).toEqual({ min: 1_000, max: 120_000 });
    expect(waitTypedBounds(0)).toEqual({ min: 0, max: 0 });
  });

  it('D-71 the Wait slider tops out at min(2 x spare, target)', () => {
    expect(waitSliderBounds(145_000, 30_000, 2_500)).toEqual({ min: 2_500, max: 60_000 });
    expect(waitSliderBounds(40_000, 30_000, 2_500)).toEqual({ min: 2_500, max: 40_000 });
    expect(waitSliderBounds(145_000, 100, 2_500)).toEqual({ min: 2_500, max: 5_000 });
    expect(waitSliderBounds(1_000, 100, 2_500)).toEqual({ min: 1_000, max: 1_000 });
    expect(waitSliderBounds(-10, 100, 2_500)).toEqual({ min: 0, max: 0 });
  });

  it('D-71 a value beyond the track pins the thumb', () => {
    expect(pinToTrack(500, 100, 400)).toEqual({ thumb: 400, beyond: 'above' });
    expect(pinToTrack(50, 100, 400)).toEqual({ thumb: 100, beyond: 'below' });
    expect(pinToTrack(250, 100, 400)).toEqual({ thumb: 250, beyond: null });
    expect(pinToTrack(100, 100, 400).beyond).toBeNull();
    expect(pinToTrack(400, 100, 400).beyond).toBeNull();
  });

  it('D-83 the cheaper price runs from ceil(30% of the advertised price) to it', () => {
    expect(cheaperBounds(10_000)).toEqual({ min: 3_000, max: 10_000 });
    expect(cheaperBounds(10_001)).toEqual({ min: 3_001, max: 10_001 });
    expect(cheaperBounds(1)).toEqual({ min: 1, max: 1 });
    expect(cheaperBounds(0)).toEqual({ min: 0, max: 0 });
  });

  it('D-83 the thumb percent is display only', () => {
    expect(cheaperThumbPercent(6_500, 10_000)).toBe(65);
    expect(cheaperThumbPercent(6_549, 10_000)).toBe(65);
    expect(cheaperThumbPercent(6_550, 10_000)).toBe(66);
    expect(cheaperThumbPercent(100, 10_000)).toBe(30);
    expect(cheaperThumbPercent(10_000, 10_000)).toBe(100);
    expect(cheaperThumbPercent(12_000, 10_000)).toBe(100);
    expect(cheaperThumbPercent(0, 0)).toBe(100);
  });
});
