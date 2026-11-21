import { toCsv } from '../csvSerialize';

describe('toCsv', () => {
  it('writes a header then rows, CRLF endings', () => {
    expect(toCsv(['a', 'b'], [{ a: 1, b: 'x' }])).toBe('a,b\r\n1,x\r\n');
  });
  it('quotes commas, quotes, CR and LF with doubled quotes', () => {
    const out = toCsv(['n'], [{ n: 'a,b' }, { n: 'say "hi"' }, { n: 'l1\nl2' }, { n: 'c\rd' }]);
    expect(out).toBe('n\r\n"a,b"\r\n"say ""hi"""\r\n"l1\nl2"\r\n"c\rd"\r\n');
  });
  it('null and undefined are empty, booleans are true/false', () => {
    expect(toCsv(['a', 'b', 'c'], [{ a: null, b: true, c: false }])).toBe('a,b,c\r\n,true,false\r\n');
    expect(toCsv(['a'], [{}])).toBe('a\r\n\r\n');
  });
  it('objects become quoted JSON', () => {
    expect(toCsv(['o'], [{ o: { k: 1 } }])).toBe('o\r\n"{""k"":1}"\r\n');
  });
  it('keeps integer minor units unchanged, never decimals', () => {
    expect(toCsv(['amt'], [{ amt: 123456 }, { amt: -250 }, { amt: 0 }])).toBe('amt\r\n123456\r\n-250\r\n0\r\n');
  });
  it('guards formula injection but leaves plain numbers alone', () => {
    const out = toCsv(['v'], [{ v: '=SUM(A1)' }, { v: '+1+1' }, { v: '-cmd' }, { v: '@x' }, { v: -5 }, { v: '-12' }]);
    expect(out).toBe("v\r\n'=SUM(A1)\r\n'+1+1\r\n'-cmd\r\n'@x\r\n-5\r\n-12\r\n");
  });
});
