import { canAdd, queueCap, QUEUE_BLOCK_AT, QUEUE_NOTE_AT } from '../queueCap';

describe('queueCap (SYN-05, D-27)', () => {
  it('thresholds are 400 and 500', () => {
    expect(QUEUE_NOTE_AT).toBe(400);
    expect(QUEUE_BLOCK_AT).toBe(500);
  });
  it.each([
    [0, 'ok'],
    [399, 'ok'],
    [400, 'note'],
    [499, 'note'],
    [500, 'blocked'],
    [650, 'blocked'],
  ])('queueCap(%i) is %s', (n, expected) => {
    expect(queueCap(n)).toBe(expected);
  });
  it('canAdd keeps queued + adding within 500', () => {
    expect(canAdd(499, 1)).toBe(true);
    expect(canAdd(499, 2)).toBe(false);
    expect(canAdd(0, 501)).toBe(false);
    expect(canAdd(0, 500)).toBe(true);
  });
});
