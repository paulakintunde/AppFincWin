// 10.1-15 (SCN-02): rows rebuilt from OCR line frames.
import { groupRows } from '../rows';
import type { ReceiptOcrLine } from '../types';

const ln = (text: string, left: number, top: number, width = 100, height = 30): ReceiptOcrLine => ({ text, frame: { left, top, width, height } });

describe('10.1-15 groupRows', () => {
  it('joins a name and a price on the same line', () => {
    const rows = groupRows({ lines: [ln('Oat milk', 10, 100), ln('4.50', 300, 102)], imageWidth: 400, imageHeight: 400 });
    expect(rows).toEqual([{ text: 'Oat milk 4.50', frame: { left: 10, top: 100, width: 390, height: 32 }, lineIndexes: [0, 1] }]);
  });
  it('keeps module order without frames, skipping blank lines', () => {
    const rows = groupRows({ lines: [{ text: 'B', frame: null }, { text: '  ', frame: null }, { text: 'A', frame: null }], imageWidth: null, imageHeight: null });
    expect(rows).toEqual([{ text: 'B', frame: null, lineIndexes: [0] }, { text: 'A', frame: null, lineIndexes: [2] }]);
  });
  it('falls back to module order when any line lacks a frame', () => {
    const rows = groupRows({ lines: [ln('X', 0, 300), { text: 'Y', frame: null }], imageWidth: null, imageHeight: null });
    expect(rows.map((r) => r.text)).toEqual(['X', 'Y']);
  });
  it('rebuilds rows from reading blocks: names first, then prices', () => {
    const lines = [ln('BANANAS', 10, 100), ln('MILK', 10, 150), ln('BREAD', 10, 200), ln('1.29', 500, 101), ln('3.89', 500, 151), ln('5.49', 500, 199)];
    expect(groupRows({ lines, imageWidth: 600, imageHeight: 400 }).map((r) => r.text)).toEqual(['BANANAS 1.29', 'MILK 3.89', 'BREAD 5.49']);
  });
  it('follows a tilt of 2.5 degrees either way across the width', () => {
    // slope ~ tan(2.5deg) = 0.0437: a price 900 px to the right sits ~39 px lower (or higher) than its name.
    const names: ReceiptOcrLine[] = [];
    for (let i = 0; i < 6; i += 1) names.push(ln(`ITEM ${i}`, 0, 100 + i * 50, 100, 30));
    const want = ['ITEM 0 0.99', 'ITEM 1 1.99', 'ITEM 2 2.99', 'ITEM 3 3.99', 'ITEM 4 4.99', 'ITEM 5 5.99'];
    for (const dy of [39, -39]) {
      const prices = names.map((_, i) => ln(`${i}.99`, 900, 100 + i * 50 + dy, 100, 30));
      expect(groupRows({ lines: [...names, ...prices], imageWidth: 1000, imageHeight: 600 }).map((r) => r.text)).toEqual(want);
    }
  });
  it('a single framed line is one row', () => {
    expect(groupRows({ lines: [ln('ONLY', 5, 5)], imageWidth: 10, imageHeight: 10 })).toEqual([{ text: 'ONLY', frame: { left: 5, top: 5, width: 100, height: 30 }, lineIndexes: [0] }]);
  });
});
