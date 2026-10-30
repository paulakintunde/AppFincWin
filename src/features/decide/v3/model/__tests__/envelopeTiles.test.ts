import { envelopeTiles } from '../envelopeTiles';

const mk = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `e${i}` }));

describe('envelopeTiles', () => {
  it('six items give four tiles and more 6', () => {
    const r = envelopeTiles(mk(6));
    expect(r.tiles).toHaveLength(4);
    expect(r.more).toBe(6);
    expect(r.empty).toBe(false);
  });
  it('three items give three tiles', () => {
    expect(envelopeTiles(mk(3))).toMatchObject({ more: 0, empty: false });
    expect(envelopeTiles(mk(3)).tiles).toHaveLength(3);
  });
  it('none is empty', () => {
    expect(envelopeTiles([])).toEqual({ tiles: [], more: 0, empty: true });
  });
});
