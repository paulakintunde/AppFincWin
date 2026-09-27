import fc from 'fast-check';
import { decodeText } from '../decodeText';
import { accountFamilyOf } from '../types';
import * as statementBarrel from '../index';

// A lone (unpaired) surrogate can't be represented as valid UTF-8 or a clean
// UTF-16 round trip, so the round-trip properties below exclude it -- this
// mirrors the plan's "fc.string({ unit: 'binary' }) excluding lone
// surrogates" instruction.
function hasLoneSurrogate(s: string): boolean {
  for (let i = 0; i < s.length; i += 1) {
    const code = s.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = s.charCodeAt(i + 1);
      if (Number.isNaN(next) || next < 0xdc00 || next > 0xdfff) return true;
      i += 1; // skip the paired low surrogate
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return true;
    }
  }
  return false;
}

describe('decodeText: BOM detection', () => {
  it('honours a UTF-8 BOM and strips it', () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, 0x41, 0x42]);
    expect(decodeText(bytes)).toEqual({ text: 'AB', encoding: 'utf-8' });
  });

  it('honours a UTF-16LE BOM', () => {
    const bytes = new Uint8Array([0xff, 0xfe, 0x41, 0x00, 0x42, 0x00]);
    expect(decodeText(bytes)).toEqual({ text: 'AB', encoding: 'utf-16le' });
  });

  it('honours a UTF-16BE BOM', () => {
    const bytes = new Uint8Array([0xfe, 0xff, 0x00, 0x41, 0x00, 0x42]);
    expect(decodeText(bytes)).toEqual({ text: 'AB', encoding: 'utf-16be' });
  });

  it('drops an odd trailing byte under a UTF-16LE BOM rather than throwing', () => {
    const bytes = new Uint8Array([0xff, 0xfe, 0x41, 0x00, 0x99]);
    expect(decodeText(bytes)).toEqual({ text: 'A', encoding: 'utf-16le' });
  });

  it('turns an unpaired high surrogate under a UTF-16LE BOM into U+FFFD', () => {
    // 0xD800 little-endian, with nothing following it.
    const bytes = new Uint8Array([0xff, 0xfe, 0x00, 0xd8]);
    expect(decodeText(bytes)).toEqual({ text: '�', encoding: 'utf-16le' });
  });

  it('turns a lone low surrogate under a UTF-16LE BOM into U+FFFD', () => {
    // 0xDC00 little-endian, with no preceding high surrogate.
    const bytes = new Uint8Array([0xff, 0xfe, 0x00, 0xdc]);
    expect(decodeText(bytes)).toEqual({ text: '�', encoding: 'utf-16le' });
  });

  it('is lenient (U+FFFD, never a CP1252 fallback) for an invalid byte once a UTF-8 BOM has committed the encoding', () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, 0xff]);
    expect(decodeText(bytes)).toEqual({ text: '�', encoding: 'utf-8' });
  });

  it('is lenient for a truncated multi-byte sequence once a UTF-8 BOM has committed the encoding', () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, 0xc2]);
    expect(decodeText(bytes)).toEqual({ text: '�', encoding: 'utf-8' });
  });

  it('is lenient for a bad continuation byte once a UTF-8 BOM has committed the encoding', () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, 0xc2, 0x20]);
    expect(decodeText(bytes)).toEqual({ text: '� ', encoding: 'utf-8' });
  });
});

describe('decodeText: Windows-1252 fallback', () => {
  it('falls back to windows-1252 on the first invalid UTF-8 byte, decoding the whole input', () => {
    const bytes = new Uint8Array([0x41, 0xa3, 0x31]);
    expect(decodeText(bytes)).toEqual({ text: 'A£1', encoding: 'windows-1252' });
  });

  it('maps 0x80 to the Euro sign', () => {
    expect(decodeText(new Uint8Array([0x80]))).toEqual({ text: '€', encoding: 'windows-1252' });
  });

  it('maps an undefined CP1252 slot (0x81) to its own Latin-1 code point', () => {
    expect(decodeText(new Uint8Array([0x81]))).toEqual({ text: '\u0081', encoding: 'windows-1252' });
  });
});

describe('decodeText: never throws (property)', () => {
  it('never throws for any Uint8Array, and never invents more text than there were bytes', () => {
    fc.assert(
      fc.property(fc.uint8Array({ maxLength: 200 }), (bytes) => {
        let result: ReturnType<typeof decodeText> | undefined;
        expect(() => {
          result = decodeText(bytes);
        }).not.toThrow();
        expect(result?.text.length).toBeLessThanOrEqual(bytes.length);
        expect(['utf-8', 'utf-16le', 'utf-16be', 'windows-1252']).toContain(result?.encoding);
      }),
      { numRuns: 300 }
    );
  });
});

describe('decodeText: UTF-8 round-trip property (fast-check)', () => {
  it('recovers any JS string from its own UTF-8 bytes, with or without a BOM', () => {
    fc.assert(
      fc.property(
        fc.string({ unit: 'binary' }).filter((s) => !hasLoneSurrogate(s)),
        fc.boolean(),
        (s, withBom) => {
          const encoded = Buffer.from(s, 'utf8');
          const bytes = withBom ? Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), encoded]) : encoded;
          expect(decodeText(new Uint8Array(bytes))).toEqual({ text: s, encoding: 'utf-8' });
        }
      ),
      { numRuns: 200 }
    );
  });
});

describe('decodeText: UTF-16 round-trip property (fast-check)', () => {
  it('recovers any JS string from its own UTF-16LE bytes under the FF FE BOM', () => {
    fc.assert(
      fc.property(fc.string({ unit: 'binary' }).filter((s) => !hasLoneSurrogate(s)), (s) => {
        const encoded = Buffer.from(s, 'utf16le');
        const bytes = Buffer.concat([Buffer.from([0xff, 0xfe]), encoded]);
        expect(decodeText(new Uint8Array(bytes))).toEqual({ text: s, encoding: 'utf-16le' });
      }),
      { numRuns: 150 }
    );
  });

  it('recovers any JS string from its own UTF-16BE bytes under the FE FF BOM', () => {
    fc.assert(
      fc.property(fc.string({ unit: 'binary' }).filter((s) => !hasLoneSurrogate(s)), (s) => {
        const little = Buffer.from(s, 'utf16le');
        const big = Buffer.alloc(little.length);
        for (let i = 0; i < little.length; i += 2) {
          big[i] = little[i + 1] as number;
          big[i + 1] = little[i] as number;
        }
        const bytes = Buffer.concat([Buffer.from([0xfe, 0xff]), big]);
        expect(decodeText(new Uint8Array(bytes))).toEqual({ text: s, encoding: 'utf-16be' });
      }),
      { numRuns: 150 }
    );
  });
});

describe('decodeText: no-leak (never throws for sensitive statement text)', () => {
  const sensitiveInputs = [
    'TESCO STORES 3021',
    'DR JONES PHARMACY',
    '1 234,56 OD at ACME LTD',
    'TESCO STORES 3021 -12.50 CR',
  ];

  it.each(sensitiveInputs)('never throws decoding %p (clean, truncated, or with a BOM)', (text) => {
    const clean = Buffer.from(text, 'utf8');
    const truncated = clean.subarray(0, Math.max(1, clean.length - 1));
    const withBom = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), clean]);
    for (const bytes of [clean, truncated, withBom]) {
      expect(() => decodeText(new Uint8Array(bytes))).not.toThrow();
    }
  });
});

describe('barrel', () => {
  it('re-exports decodeText, sniffFormat and the statement contracts', () => {
    expect(statementBarrel.decodeText).toBe(decodeText);
    expect(typeof statementBarrel.sniffFormat).toBe('function');
    expect(typeof statementBarrel.accountFamilyOf).toBe('function');
  });
});

// The statement contracts module (types.ts) has no dedicated test file of
// its own -- this "contracts" block is where its one pure function is
// covered, per the plan.
describe('contracts', () => {
  it.each([
    ['checking', 'deposit'],
    ['savings', 'deposit'],
    ['cash', 'deposit'],
    ['investment', 'deposit'],
    ['other', 'deposit'],
    ['credit', 'card'],
    ['loan', 'loan'],
  ] as const)('accountFamilyOf(%p) === %p', (kind, family) => {
    expect(accountFamilyOf(kind)).toBe(family);
  });
});
