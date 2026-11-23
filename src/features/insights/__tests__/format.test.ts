import { monthShort, percentText, tenthsText } from '../format';

describe('insights format', () => {
  it('turns basis points into whole percent, half up', () => {
    expect(percentText(3400)).toBe('34');
    expect(percentText(3450)).toBe('35');
    expect(percentText(3449)).toBe('34');
    expect(percentText(0)).toBe('0');
  });
  it('shows tenths with one decimal', () => {
    expect(tenthsText(21, 'en-US')).toBe('2.1');
    expect(tenthsText(30, 'en-US')).toBe('3.0');
  });
  it('shortens a month, with the year when asked', () => {
    expect(monthShort('2026-06', 'en-US', false)).toBe('Jun');
    expect(monthShort('2026-06', 'en-US', true)).toBe('Jun ’26');
  });
});
