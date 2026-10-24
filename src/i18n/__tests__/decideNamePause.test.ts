// D-105 (worded per D-106): a month figure with saving and investing paused is never worded as plain "overspent" alone; the pot delete confirm and the Pots empty state.
import en from '../locales/en';

const d = en.decide;

describe('D-105 name the pause', () => {
  it('D-105 the quick result names the pause before the shortfall', () => {
    expect(d.quick.line.cashMonthShort).toBe('Cash covers it. Even with saving paused, the month would end {{short}} overspent.');
    expect(d.quick.line.cashMonthShort).toMatch(/saving paused/);
  });

  it('D-105 What breaks names the pause in the title and the body, never plain "does not close"', () => {
    expect(d.warn.monthTitle).toBe('Still overspent with saving paused');
    expect(d.warn.monthBody).toMatch(/Even with saving and investing paused/);
    expect(d.warn.monthTitle).not.toMatch(/does not close/);
  });

  it('D-105 the month title fits the 44-character fold preview (title only, D-106: the value is the absolute amount in the row)', () => {
    // the What breaks preview shows the month warning's title without its value, so the wide amount cannot push it over
    expect(d.warn.monthTitle.length).toBe(34);
    expect(d.warn.monthTitle.length).toBeLessThanOrEqual(44);
    expect(d.warn.monthValue.replace('{{amount}}', '$123,456.78')).toBe('$123,456.78');
    expect(d.warn.monthTitle).not.toContain('{{');
  });

  it('D-106 the pause naming and the no-pause variant survive the rewording', () => {
    expect(d.quick.line.cashMonthShort).toMatch(/Even with saving paused, the month would end \{\{short\}\} overspent\./);
    expect(d.warn.monthTitle).toMatch(/with saving paused$/);
    expect(d.warn.monthTitleNoPause).toBe('The month does not close');
    expect(d.quick.line.cashMonthShortNoPause).not.toMatch(/paused/);
    for (const s of [d.quick.line.cashMonthShort, d.quick.line.cashMonthShortNoPause, d.warn.monthTitle]) expect(s).not.toMatch(/short/);
  });

  it('D-105 the Pots empty state does not repeat the sub-line', () => {
    expect(d.pots.empty).toBe('No pots yet. A car service in March is one.');
    expect(d.pots.empty).not.toMatch(/set amount and a date/);
  });

  it('D-105 the pot delete confirm exists and is declarative', () => {
    expect(d.pots.deleteConfirm).toEqual({
      title: 'Delete {{name}}?',
      body: 'Its set-aside stops coming off net free cash flow. Undo is available right after.',
      confirm: 'Delete',
      cancel: 'Cancel',
    });
  });

  it('D-105 nothing to pause uses the plain month wording (strings)', () => {
    expect(d.quick.line.cashMonthShortNoPause).toBe('Cash covers it, but the month would end {{short}} overspent.');
    expect(d.warn.monthTitleNoPause).toBe('The month does not close');
    expect(d.warn.monthBodyNoPause).toBe('Every month would need {{short}} more than comes in.');
  });
});
