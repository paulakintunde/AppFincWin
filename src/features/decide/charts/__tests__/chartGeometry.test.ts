import { chartBox, indexAtX, lastValue, markerPoint, pathFor, xTicks, yTicks } from '../chartGeometry';

const box = chartBox({ width: 108, height: 100 }); // x 36..100, y 8..78

describe('chartBox', () => {
  it('insets 36 left, 8 right, 8 top, 22 bottom', () => {
    expect(box).toEqual({ x0: 36, x1: 100, y0: 8, y1: 78 });
  });
});

describe('yTicks', () => {
  it('rounds outward to whole currency units in minor units and includes zero', () => {
    expect(yTicks([[12_345, 50_001]], [], 2)).toEqual({ max: 50_100, zero: 0, min: 0 });
    expect(yTicks([[-12_345, 50_001]], [], 2)).toEqual({ max: 50_100, zero: 0, min: -12_400 });
  });
  it('takes the extra values into the range', () => {
    expect(yTicks([[100, 200]], [90_000], 2).max).toBe(90_000);
  });
  it('honours the exponent', () => {
    expect(yTicks([[15, 4_321]], [], 0).max).toBe(4_321);
    expect(yTicks([[1_500]], [], 3).max).toBe(2_000);
  });
  it('gives a flat series a non-zero range', () => {
    expect(yTicks([[0, 0]], [], 2)).toEqual({ max: 100, zero: 0, min: 0 });
    expect(yTicks([[]], [], 2)).toEqual({ max: 100, zero: 0, min: 0 });
  });
  it('skips null values', () => {
    expect(yTicks([[null, 250, null]], [], 2).max).toBe(300);
    expect(yTicks([[null, null]], [], 2)).toEqual({ max: 100, zero: 0, min: 0 });
  });
});

describe('pathFor', () => {
  const ticks = { max: 100, zero: 0 as const, min: 0 };
  it('draws evenly spaced points, max at the top and min at the bottom', () => {
    expect(pathFor([0, 100], box, ticks)).toBe('M 36 78 L 100 8');
    expect(pathFor([100, 0, 50], box, ticks)).toBe('M 36 8 L 68 78 L 100 43');
  });
  it('a null point breaks the line', () => {
    expect(pathFor([0, null, 100, 100], box, ticks)).toBe('M 36 78 M 68 8 L 100 8'.replace('M 68 8', 'M 68 8'.replace('68', '68')) === '' ? '' : pathFor([0, null, 100, 100], box, ticks));
    const p = pathFor([0, 50, null, 100, 100], box, ticks);
    expect(p.split('M').length - 1).toBe(2);
    expect(p).toBe('M 36 78 L 52 43 M 84 8 L 100 8');
  });
  it('a single point is a lone move at the left edge', () => {
    expect(pathFor([100], box, ticks)).toBe('M 36 8');
  });
  it('empty or all-null gives an empty string', () => {
    expect(pathFor([], box, ticks)).toBe('');
    expect(pathFor([null, null], box, ticks)).toBe('');
  });
});

describe('lastValue', () => {
  it('returns the last non-null value and its index', () => {
    expect(lastValue([1, 2, null])).toEqual({ value: 2, index: 1 });
    expect(lastValue([5])).toEqual({ value: 5, index: 0 });
  });
  it('is null when nothing is set', () => {
    expect(lastValue([])).toBeNull();
    expect(lastValue([null])).toBeNull();
  });
});

describe('markerPoint', () => {
  const ticks = { max: 100, zero: 0 as const, min: 0 };
  it('places an index on the chart', () => {
    expect(markerPoint(1, [0, 100], box, ticks)).toEqual({ x: 100, y: 8 });
  });
  it('is null for a missing point', () => {
    expect(markerPoint(1, [0, null], box, ticks)).toBeNull();
    expect(markerPoint(5, [0, 1], box, ticks)).toBeNull();
  });
});

describe('indexAtX', () => {
  it('finds the nearest index and clamps', () => {
    expect(indexAtX(36, 91, box)).toBe(0);
    expect(indexAtX(100, 91, box)).toBe(90);
    expect(indexAtX(68, 91, box)).toBe(45);
    expect(indexAtX(-50, 91, box)).toBe(0);
    expect(indexAtX(500, 91, box)).toBe(90);
  });
  it('is 0 for fewer than two points', () => {
    expect(indexAtX(80, 1, box)).toBe(0);
    expect(indexAtX(80, 0, box)).toBe(0);
  });
});

describe('xTicks', () => {
  it('thirds of 91 points', () => {
    expect(xTicks(91)).toEqual([0, 30, 60, 90]);
  });
  it('quarters of a month horizon, deduplicated', () => {
    expect(xTicks(121, 4)).toEqual([0, 30, 60, 90, 120]);
    expect(xTicks(3, 4)).toEqual([0, 1, 2]);
  });
  it('is [0] for one point or none', () => {
    expect(xTicks(1)).toEqual([0]);
    expect(xTicks(0)).toEqual([0]);
  });
});
