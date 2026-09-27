import fc from 'fast-check';
import { OFX_LIMITS, splitOfxHeader, tokenizeOfx } from '../tokenize';
import * as ofxBarrel from '../index';

describe('splitOfxHeader: OFX 1.x (SGML)', () => {
  it('reads VERSION/CHARSET from KEY:VALUE header lines and slices the body from <OFX>', () => {
    const text = 'OFXHEADER:100\r\nDATA:OFXSGML\r\nVERSION:102\r\nCHARSET:1252\r\n\r\n<OFX><X>1</X></OFX>';
    expect(splitOfxHeader(text)).toEqual({
      ok: true,
      version: '102',
      charset: '1252',
      body: '<OFX><X>1</X></OFX>',
    });
  });

  it('finds the key at the very start of the header (no preceding line)', () => {
    const text = 'VERSION:102<OFX></OFX>';
    expect(splitOfxHeader(text)).toEqual({ ok: true, version: '102', charset: null, body: '<OFX></OFX>' });
  });

  it('skips a KEY:VALUE-shaped substring that is not at a line start', () => {
    const text = 'XVERSION:1\r\nVERSION:102\r\n\r\n<OFX></OFX>';
    expect(splitOfxHeader(text)).toEqual({ ok: true, version: '102', charset: null, body: '<OFX></OFX>' });
  });

  it('treats a bare \\r as a line break for the key-start check', () => {
    const text = 'OFXHEADER:100\rVERSION:102\r\n\r\n<OFX></OFX>';
    expect(splitOfxHeader(text)).toEqual({ ok: true, version: '102', charset: null, body: '<OFX></OFX>' });
  });

  it('returns null for a key that never appears', () => {
    const text = 'OFXHEADER:100\r\n\r\n<OFX></OFX>';
    expect(splitOfxHeader(text)).toEqual({ ok: true, version: null, charset: null, body: '<OFX></OFX>' });
  });
});

describe('splitOfxHeader: OFX 2.x (XML)', () => {
  it('reads VERSION from the <?OFX …?> processing instruction, never CHARSET', () => {
    const text = '<?xml version="1.0"?>\n<?OFX OFXHEADER="200" VERSION="220"?>\n<OFX><X>1</X></OFX>';
    expect(splitOfxHeader(text)).toEqual({
      ok: true,
      version: '220',
      charset: null,
      body: '<OFX><X>1</X></OFX>',
    });
  });

  it('does not confuse the <?xml version="1.0"?> attribute with <?OFX ...VERSION=...>', () => {
    const text = '<?xml version="1.0"?>\n<?OFX OFXHEADER="200" VERSION="220"?>\n<OFX></OFX>';
    const result = splitOfxHeader(text);
    expect(result.ok).toBe(true);
    expect(result.ok && result.version).toBe('220');
  });

  it('returns null version when the <?OFX …?> PI has no VERSION attribute', () => {
    const text = '<?xml version="1.0"?>\n<?OFX OFXHEADER="200"?>\n<OFX></OFX>';
    expect(splitOfxHeader(text)).toEqual({ ok: true, version: null, charset: null, body: '<OFX></OFX>' });
  });

  it('returns null version when the closing quote is missing', () => {
    const text = '<?OFX VERSION="220\n<OFX></OFX>';
    const result = splitOfxHeader(text);
    expect(result.ok).toBe(true);
    expect(result.ok && result.version).toBeNull();
  });

  it('treats an unterminated <?OFX …?> PI (no ?> before <OFX>) as running to end of header', () => {
    const text = '<?OFX VERSION="220"\n<OFX></OFX>';
    const result = splitOfxHeader(text);
    expect(result.ok).toBe(true);
    expect(result.ok && result.version).toBe('220');
  });
});

describe('splitOfxHeader: root detection', () => {
  it('finds a lower-case <ofx> root case-insensitively and preserves body case', () => {
    const text = 'OFXHEADER:100\r\n\r\n<ofx><x>1</x></ofx>';
    expect(splitOfxHeader(text)).toEqual({
      ok: true,
      version: null,
      charset: null,
      body: '<ofx><x>1</x></ofx>',
    });
  });

  it('fails with no-ofx-root when <OFX> never appears', () => {
    expect(splitOfxHeader('OFXHEADER:100\r\nVERSION:102\r\n\r\nnot an ofx file at all')).toEqual({
      ok: false,
      error: 'no-ofx-root',
    });
  });
});

describe('tokenizeOfx: basic structure', () => {
  it('tokenizes a mix of unclosed and closed leaves plus an aggregate close', () => {
    expect(tokenizeOfx('<STMTTRN><TRNAMT>-12.50<FITID>1</STMTTRN>')).toEqual({
      ok: true,
      tokens: [
        { t: 'open', name: 'STMTTRN' },
        { t: 'open', name: 'TRNAMT' },
        { t: 'text', value: '-12.50' },
        { t: 'open', name: 'FITID' },
        { t: 'text', value: '1' },
        { t: 'close', name: 'STMTTRN' },
      ],
    });
  });

  it('upper-cases tag names', () => {
    expect(tokenizeOfx('<trnamt>3000')).toEqual({
      ok: true,
      tokens: [
        { t: 'open', name: 'TRNAMT' },
        { t: 'text', value: '3000' },
      ],
    });
  });

  it('keeps a dotted proprietary tag such as INTU.BID as one ordinary name', () => {
    expect(tokenizeOfx('<INTU.BID>3000')).toEqual({
      ok: true,
      tokens: [
        { t: 'open', name: 'INTU.BID' },
        { t: 'text', value: '3000' },
      ],
    });
  });

  it('skips attributes inside a tag up to the closing >', () => {
    expect(tokenizeOfx('<TAG foo="bar" baz=\'1\'>x</TAG>')).toEqual({
      ok: true,
      tokens: [
        { t: 'open', name: 'TAG' },
        { t: 'text', value: 'x' },
        { t: 'close', name: 'TAG' },
      ],
    });
  });

  it('ignores an empty tag name (<> or </>) and emits no token', () => {
    expect(tokenizeOfx('<><X>1</X></>')).toEqual({
      ok: true,
      tokens: [
        { t: 'open', name: 'X' },
        { t: 'text', value: '1' },
        { t: 'close', name: 'X' },
      ],
    });
  });

  it('treats an unterminated tag at EOF (no closing >) as consuming the rest of input', () => {
    expect(tokenizeOfx('<X>1<Y')).toEqual({
      ok: true,
      tokens: [
        { t: 'open', name: 'X' },
        { t: 'text', value: '1' },
      ],
    });
  });
});

describe('tokenizeOfx: whitespace and trimming', () => {
  it('drops whitespace-only text between tags', () => {
    expect(tokenizeOfx('<A>\n  \t\r\n<B>1</B></A>')).toEqual({
      ok: true,
      tokens: [
        { t: 'open', name: 'A' },
        { t: 'open', name: 'B' },
        { t: 'text', value: '1' },
        { t: 'close', name: 'B' },
        { t: 'close', name: 'A' },
      ],
    });
  });

  it('trims leading/trailing whitespace around real text', () => {
    expect(tokenizeOfx('<A>  hello world  </A>')).toEqual({
      ok: true,
      tokens: [
        { t: 'open', name: 'A' },
        { t: 'text', value: 'hello world' },
        { t: 'close', name: 'A' },
      ],
    });
  });
});

describe('tokenizeOfx: comments, CDATA, processing instructions', () => {
  it('skips an SGML/XML comment entirely, emitting no token', () => {
    expect(tokenizeOfx('<A>before<!-- a comment <B>fake</B> -->after</A>')).toEqual({
      ok: true,
      tokens: [
        { t: 'open', name: 'A' },
        { t: 'text', value: 'beforeafter' },
        { t: 'close', name: 'A' },
      ],
    });
  });

  it('treats an unterminated comment as running to EOF', () => {
    expect(tokenizeOfx('<A>x<!-- never closed')).toEqual({
      ok: true,
      tokens: [
        { t: 'open', name: 'A' },
        { t: 'text', value: 'x' },
      ],
    });
  });

  it('emits CDATA content as literal text with no entity decoding or tag recognition', () => {
    expect(tokenizeOfx('<A><![CDATA[A&B <x>]]></A>')).toEqual({
      ok: true,
      tokens: [
        { t: 'open', name: 'A' },
        { t: 'text', value: 'A&B <x>' },
        { t: 'close', name: 'A' },
      ],
    });
  });

  it('drops an empty CDATA section without emitting a text token', () => {
    expect(tokenizeOfx('<A><![CDATA[]]></A>')).toEqual({
      ok: true,
      tokens: [
        { t: 'open', name: 'A' },
        { t: 'close', name: 'A' },
      ],
    });
  });

  it('treats an unterminated CDATA section as running to EOF', () => {
    expect(tokenizeOfx('<A><![CDATA[unterminated')).toEqual({
      ok: true,
      tokens: [{ t: 'open', name: 'A' }],
    });
  });

  it('skips a processing instruction such as <?xml …?> entirely', () => {
    expect(tokenizeOfx('<?xml version="1.0"?><A>1</A>')).toEqual({
      ok: true,
      tokens: [
        { t: 'open', name: 'A' },
        { t: 'text', value: '1' },
        { t: 'close', name: 'A' },
      ],
    });
  });

  it('treats an unterminated processing instruction as running to EOF', () => {
    expect(tokenizeOfx('<A>1</A><?xml unterminated')).toEqual({
      ok: true,
      tokens: [
        { t: 'open', name: 'A' },
        { t: 'text', value: '1' },
        { t: 'close', name: 'A' },
      ],
    });
  });
});

describe('tokenizeOfx: entity decoding', () => {
  it('decodes the five named entities and both numeric forms', () => {
    expect(tokenizeOfx('<A>&amp; &lt; &gt; &quot; &apos; &#163; &#xA3;</A>')).toEqual({
      ok: true,
      tokens: [
        { t: 'open', name: 'A' },
        { t: 'text', value: '& < > " \' £ £' },
        { t: 'close', name: 'A' },
      ],
    });
  });

  it('decodes a lower-case hex numeric entity', () => {
    expect(tokenizeOfx('<A>&#xa3;</A>')).toEqual({
      ok: true,
      tokens: [
        { t: 'open', name: 'A' },
        { t: 'text', value: '£' },
        { t: 'close', name: 'A' },
      ],
    });
  });

  it('keeps a bare & followed by a space literal', () => {
    expect(tokenizeOfx('<A>Tom & Jerry</A>')).toEqual({
      ok: true,
      tokens: [
        { t: 'open', name: 'A' },
        { t: 'text', value: 'Tom & Jerry' },
        { t: 'close', name: 'A' },
      ],
    });
  });

  it('keeps an unrecognised named entity literal, including its trailing text', () => {
    expect(tokenizeOfx('<A>R&D;co</A>')).toEqual({
      ok: true,
      tokens: [
        { t: 'open', name: 'A' },
        { t: 'text', value: 'R&D;co' },
        { t: 'close', name: 'A' },
      ],
    });
  });

  it('keeps an unterminated entity (no ; within the window) literal', () => {
    const text = `<A>${'x'.repeat(20)}&nosemicolonanywherenearby</A>`;
    const result = tokenizeOfx(text);
    expect(result.ok).toBe(true);
    expect(result.ok && result.tokens[1]).toEqual({
      t: 'text',
      value: `${'x'.repeat(20)}&nosemicolonanywherenearby`,
    });
  });

  it('keeps a numeric entity with invalid digits literal', () => {
    expect(tokenizeOfx('<A>&#12a3;</A>')).toEqual({
      ok: true,
      tokens: [
        { t: 'open', name: 'A' },
        { t: 'text', value: '&#12a3;' },
        { t: 'close', name: 'A' },
      ],
    });
  });

  it('keeps an empty numeric entity (&#;) literal', () => {
    expect(tokenizeOfx('<A>&#;</A>')).toEqual({
      ok: true,
      tokens: [
        { t: 'open', name: 'A' },
        { t: 'text', value: '&#;' },
        { t: 'close', name: 'A' },
      ],
    });
  });

  it('keeps an empty hex numeric entity (&#x;) literal', () => {
    expect(tokenizeOfx('<A>&#x;</A>')).toEqual({
      ok: true,
      tokens: [
        { t: 'open', name: 'A' },
        { t: 'text', value: '&#x;' },
        { t: 'close', name: 'A' },
      ],
    });
  });

  it('keeps a numeric entity whose code point is a surrogate literal', () => {
    expect(tokenizeOfx('<A>&#xD800;</A>')).toEqual({
      ok: true,
      tokens: [
        { t: 'open', name: 'A' },
        { t: 'text', value: '&#xD800;' },
        { t: 'close', name: 'A' },
      ],
    });
  });

  it('keeps a numeric entity above the valid Unicode range literal', () => {
    expect(tokenizeOfx('<A>&#x110000;</A>')).toEqual({
      ok: true,
      tokens: [
        { t: 'open', name: 'A' },
        { t: 'text', value: '&#x110000;' },
        { t: 'close', name: 'A' },
      ],
    });
  });
});

describe('tokenizeOfx: budgets', () => {
  it('accepts input exactly at the maxBytes boundary', () => {
    const text = 'x'.repeat(OFX_LIMITS.maxBytes);
    const result = tokenizeOfx(text);
    expect(result.ok).toBe(true);
  });

  it('rejects input one character over the maxBytes boundary', () => {
    const text = 'x'.repeat(OFX_LIMITS.maxBytes + 1);
    expect(tokenizeOfx(text)).toEqual({ ok: false, error: 'too-large' });
  });
});

describe('tokenizeOfx: adversarial properties (RESEARCH §A1, the ofx-js regression)', () => {
  it('never throws for arbitrary strings up to 1,000,000 characters', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 1_000_000 }), (s) => {
        expect(() => tokenizeOfx(s)).not.toThrow();
      }),
      { numRuns: 30 }
    );
  });

  it('never throws for runs of "<" + "A".repeat(n) + ">"', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 2000 }), (n) => {
        const text = `<${'A'.repeat(n)}>`;
        expect(() => tokenizeOfx(text)).not.toThrow();
      }),
      { numRuns: 50 }
    );
  });

  it('tokenizes a 200 KB file of 26-char dotless tags followed by text in under 500ms', () => {
    const tag = 'A'.repeat(26);
    const chunk = `<${tag}>value`;
    const repeats = Math.ceil((200 * 1024) / chunk.length);
    const text = chunk.repeat(repeats);

    const start = Date.now();
    const result = tokenizeOfx(text);
    const elapsed = Date.now() - start;

    expect(result.ok).toBe(true);
    expect(elapsed).toBeLessThan(500);
  });
});

describe('tokenizeOfx: no-leak', () => {
  it('never throws for sensitive payee text with a stray close tag, and never returns a message containing it', () => {
    const text = '<A>DR JONES PHARMACY</NAME><B>1</B>';
    const result = tokenizeOfx(text);
    expect(() => tokenizeOfx(text)).not.toThrow();
    expect(JSON.stringify(result)).not.toContain('JONES');
    // The stray </NAME> is not a-priori "sensitive" leakage from tokenizeOfx
    // (tree-level warnings are engine/ofx/tree's job) -- it simply becomes an
    // ordinary close token here, which is asserted for completeness.
    expect(result.ok && result.tokens.some((t) => t.t === 'close' && t.name === 'NAME')).toBe(true);
  });
});

describe('barrel', () => {
  it('re-exports splitOfxHeader, tokenizeOfx and OFX_LIMITS', () => {
    expect(ofxBarrel.splitOfxHeader).toBe(splitOfxHeader);
    expect(ofxBarrel.tokenizeOfx).toBe(tokenizeOfx);
    expect(ofxBarrel.OFX_LIMITS).toBe(OFX_LIMITS);
  });
});
