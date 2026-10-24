// D-105: a month figure with saving and investing paused is never worded as plain "short"; the pot delete confirm and the Pots empty state.
import en from '../locales/en';

const d = en.decide;

describe('D-105 name the pause', () => {
  it('D-105 the quick result names the pause before the shortfall', () => {
    expect(d.quick.line.cashMonthShort).toBe('Cash covers it. Even with saving paused, the month would end {{short}} short.');
    expect(d.quick.line.cashMonthShort).toMatch(/saving paused/);
  });

  it('D-105 What breaks names the pause in the title and the body, never plain "does not close"', () => {
    expect(d.warn.monthTitle).toBe('Still short with saving paused');
    expect(d.warn.monthBody).toMatch(/Even with saving and investing paused/);
    expect(d.warn.monthTitle).not.toMatch(/does not close/);
  });

  it('D-105 the month title and value fit the 44-character fold preview', () => {
    expect(`${d.warn.monthTitle} −$99,999.99`.length).toBeLessThanOrEqual(44);
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
});
