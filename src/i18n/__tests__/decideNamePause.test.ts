// D-105 (worded per D-106): a month figure with saving and investing paused is never worded as plain "overspent" alone.
// 06.1-37: the quick-result, What-breaks body and pot sentences went with the old Decide; the month warning title stays.
import en from '../locales/en';

const d = en.decide;

describe('D-105 name the pause', () => {
  it('D-105 What breaks names the pause in the title, never plain "does not close"', () => {
    expect(d.warn.monthTitle).toBe('Still overspent with saving paused');
    expect(d.warn.monthTitle).not.toMatch(/does not close/);
  });

  it('D-105 the month title fits the 44-character fold preview', () => {
    expect(d.warn.monthTitle.length).toBe(34);
    expect(d.warn.monthTitle.length).toBeLessThanOrEqual(44);
    expect(d.warn.monthTitle).not.toContain('{{');
  });

  it('D-106 the pause naming survives the rewording', () => {
    expect(d.warn.monthTitle).toMatch(/with saving paused$/);
    expect(d.warn.monthTitle).not.toMatch(/short/);
  });
});
