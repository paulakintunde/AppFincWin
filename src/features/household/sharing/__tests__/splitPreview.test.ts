import { splitPreview } from '../splitPreview';

const members = [
  { userId: 'me', weight: 60 },
  { userId: 'sam', weight: 40 },
];

describe('splitPreview (engine splitLine only)', () => {
  it('even split of 84.00 is 42.00 each and adds up', () => {
    const p = splitPreview(8400, 'even', members, ['me', 'sam'], 'me');
    expect(p.rows).toEqual([
      { userId: 'me', amount: 4200 },
      { userId: 'sam', amount: 4200 },
    ]);
    expect(p.addsUp).toBe(true);
    expect(p.reason).toBeNull();
  });

  it('an odd cent goes by the engine rule and the rows still add to the total', () => {
    const p = splitPreview(1001, 'even', members, ['me', 'sam'], 'me');
    expect(p.rows.reduce((s, r) => s + r.amount, 0)).toBe(1001);
    expect(p.addsUp).toBe(true);
  });

  it('by weight uses the household weights', () => {
    const p = splitPreview(10000, 'weight', members, ['me', 'sam'], 'me');
    expect(p.rows.map((r) => r.amount)).toEqual([6000, 4000]);
  });

  it('by amount 70.00 + 14.00 of 84.00 leaves nothing to assign', () => {
    const p = splitPreview(8400, 'amount', members, ['me', 'sam'], 'me', { me: 7000, sam: 1400 });
    expect(p.addsUp).toBe(true);
    expect(p.leftToAssign).toBe(0);
  });

  it('by amount 70.00 + 10.00 of 84.00 leaves 4.00 and cannot be saved', () => {
    const p = splitPreview(8400, 'amount', members, ['me', 'sam'], 'me', { me: 7000, sam: 1000 });
    expect(p.addsUp).toBe(false);
    expect(p.leftToAssign).toBe(400);
    expect(p.reason).toBe('amounts_not_total');
  });

  it('by amount over-assigned reports how far over', () => {
    const p = splitPreview(8400, 'amount', members, ['me', 'sam'], 'me', { me: 7000, sam: 2000 });
    expect(p.addsUp).toBe(false);
    expect(p.over).toBe(600);
    expect(p.leftToAssign).toBe(0);
  });

  it('even with only the payer ticked is refused: no_other_member', () => {
    const p = splitPreview(8400, 'even', members, ['me'], 'me');
    expect(p.reason).toBe('no_other_member');
    expect(p.addsUp).toBe(false);
  });

  it('mine only puts all of it on the payer', () => {
    const p = splitPreview(8400, 'mine', members, ['me'], 'me');
    expect(p.rows).toEqual([{ userId: 'me', amount: 8400 }]);
    expect(p.addsUp).toBe(true);
  });

  it('a negative (expense) total previews the same positive parts', () => {
    const p = splitPreview(-8400, 'even', members, ['me', 'sam'], 'me');
    expect(p.rows.map((r) => r.amount)).toEqual([4200, 4200]);
  });
});
