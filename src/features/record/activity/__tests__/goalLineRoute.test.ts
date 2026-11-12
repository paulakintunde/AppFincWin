// P5-CR-01: a line of a removed goal is marked paid as a plain line; a live or done goal's line goes through the confirm;
// with the goal list not settled, the confirm path (and its not-ready hint) is kept.
import { goalLineRoute } from '../goalLineRoute';

const series = new Map([['s1', { goal_id: 'g1' }]]);

describe('goalLineRoute', () => {
  it('a plain line is plain', () => {
    expect(goalLineRoute({ goal_id: null, recurring_series_id: null }, series, [])).toEqual({ kind: 'plain' });
  });

  it('a goal line with the goal loaded goes to the goal (tag on the row or from its series)', () => {
    expect(goalLineRoute({ goal_id: 'g1', recurring_series_id: null }, undefined, [{ id: 'g1' }])).toEqual({ kind: 'goal', goalId: 'g1' });
    expect(goalLineRoute({ recurring_series_id: 's1' }, series, [{ id: 'g1' }])).toEqual({ kind: 'goal', goalId: 'g1' });
  });

  it('with the goals not settled, the goal path is kept (never guessed as removed)', () => {
    expect(goalLineRoute({ goal_id: 'g1', recurring_series_id: null }, undefined, undefined)).toEqual({ kind: 'goal', goalId: 'g1' });
  });

  it('with the goals settled and the goal not among them, the goal is gone', () => {
    expect(goalLineRoute({ goal_id: 'g1', recurring_series_id: null }, undefined, [{ id: 'g2' }])).toEqual({ kind: 'goalGone' });
    expect(goalLineRoute({ recurring_series_id: 's1' }, series, [])).toEqual({ kind: 'goalGone' });
  });
});
