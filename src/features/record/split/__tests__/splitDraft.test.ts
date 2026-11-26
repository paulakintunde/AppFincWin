import { addPart, canSave, draftBalance, initDraft, removePart, setAmount, setCategory, toSaveParts } from '../splitDraft';

const line = { amount: -5000, categoryId: 'groceries', parts: null };

describe('splitDraft', () => {
  it('starts with the line category holding the full total and an empty second part', () => {
    const d = initDraft(line);
    expect(d.parts.map((p) => [p.categoryId, p.amount])).toEqual([
      ['groceries', 5000],
      [null, null],
    ]);
    expect(d.firstIsRest).toBe(true);
    expect(d.sign).toBe(-1);
    expect(draftBalance(d)).toEqual({ state: 'addsUp', amount: 0 });
  });

  it('re-derives part 1 as the rest until part 1 is edited by hand', () => {
    let d = initDraft(line);
    d = setAmount(d, d.parts[1]!.key, 2000);
    expect(d.parts[0]!.amount).toBe(3000);
    d = setAmount(d, d.parts[0]!.key, 2500);
    expect(d.firstIsRest).toBe(false);
    expect(draftBalance(d)).toEqual({ state: 'left', amount: 500 });
    expect(draftBalance(setAmount(d, d.parts[1]!.key, 3000))).toEqual({ state: 'over', amount: 500 });
    d = setAmount(d, d.parts[1]!.key, 1000);
    expect(d.parts[0]!.amount).toBe(2500);
    expect(draftBalance(d)).toEqual({ state: 'left', amount: 1500 });
  });

  it('never lets the rest go below zero', () => {
    let d = initDraft(line);
    d = setAmount(d, d.parts[1]!.key, 9000);
    expect(d.parts[0]!.amount).toBe(0);
  });

  it('reports what blocks saving', () => {
    let d = initDraft(line);
    expect(canSave(d)).toEqual({ ok: false, reason: 'needsAmount' });
    d = setAmount(d, d.parts[1]!.key, 2000);
    expect(canSave(d)).toEqual({ ok: true });
    d = setAmount(d, d.parts[0]!.key, 2500);
    expect(canSave(d)).toEqual({ ok: false, reason: 'notAddingUp' });
    d = setAmount(d, d.parts[0]!.key, 0);
    expect(canSave(d)).toEqual({ ok: false, reason: 'needsAmount' });
  });

  it('reports too few parts', () => {
    const d = initDraft(line);
    expect(canSave({ ...d, parts: [d.parts[0]!] })).toEqual({ ok: false, reason: 'tooFew' });
  });

  it('keeps at least 2 and at most 20 parts', () => {
    let d = initDraft(line);
    expect(removePart(d, d.parts[1]!.key)).toBe(d);
    for (let i = 0; i < 25; i++) d = addPart(d);
    expect(d.parts).toHaveLength(20);
    expect(addPart(d)).toBe(d);
    expect(removePart(d, d.parts[5]!.key).parts).toHaveLength(19);
    expect(removePart(d, 'nope')).toBe(d);
  });

  it('re-derives the rest after adding or removing while firstIsRest', () => {
    let d = initDraft(line);
    d = addPart(d);
    d = setAmount(d, d.parts[1]!.key, 1000);
    d = setAmount(d, d.parts[2]!.key, 500);
    expect(d.parts[0]!.amount).toBe(3500);
    d = removePart(d, d.parts[2]!.key);
    expect(d.parts[0]!.amount).toBe(4000);
  });

  it('sets a category and ignores unknown keys', () => {
    const d = initDraft(line);
    expect(setCategory(d, d.parts[1]!.key, 'dining').parts[1]!.categoryId).toBe('dining');
    expect(setCategory(d, 'nope', 'dining')).toBe(d);
    expect(setAmount(d, 'nope', 5)).toBe(d);
  });

  it('prefills an existing split and shows the gap after a total edit (D-03)', () => {
    const d = initDraft({
      amount: -6000,
      categoryId: 'groceries',
      parts: [
        { categoryId: 'groceries', amount: -3000 },
        { categoryId: 'dining', amount: -2000 },
      ],
    });
    expect(d.firstIsRest).toBe(false);
    expect(d.parts.map((p) => p.amount)).toEqual([3000, 2000]);
    expect(draftBalance(d)).toEqual({ state: 'left', amount: 1000 });
  });

  it('turns the draft back into signed parts in order', () => {
    let d = initDraft(line);
    d = setAmount(d, d.parts[1]!.key, 2000);
    expect(toSaveParts(d)).toEqual([
      { categoryId: 'groceries', amount: -3000 },
      { categoryId: null, amount: -2000 },
    ]);
    const income = initDraft({ amount: 100, categoryId: null, parts: null });
    expect(toSaveParts(setAmount(income, income.parts[1]!.key, 40)).map((p) => p.amount)).toEqual([60, 40]);
  });
});
