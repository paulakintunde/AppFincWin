import { isOverspent, monthFigure } from '../monthFigure';
import { fmt } from './helpers/fixtures';

describe('monthFigure', () => {
  it('D-106 a positive month figure reads free, a negative one overspent, amount absolute', () => {
    expect(monthFigure(1_240, fmt)).toEqual({ key: 'decide.fig.free', params: { amount: '$1240' } });
    expect(monthFigure(-300, fmt)).toEqual({ key: 'decide.fig.overspent', params: { amount: '$300' } });
    // no minus is ever passed to the formatter for an overspent figure
    expect(monthFigure(-300, fmt).params!.amount).not.toContain('-');
  });

  it('D-106 zero is free, not overspent', () => {
    expect(isOverspent(0)).toBe(false);
    expect(isOverspent(-1)).toBe(true);
    expect(isOverspent(1)).toBe(false);
    expect(monthFigure(0, fmt).key).toBe('decide.fig.free');
  });
});
