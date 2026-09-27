import fc from 'fast-check';
import { tokenizeOfx, type OfxToken } from '../tokenize';
import { buildOfxTree, child, childText, findAll, type OfxNode } from '../tree';
import * as ofxBarrel from '../index';

function build(body: string) {
  const tokenized = tokenizeOfx(body);
  if (!tokenized.ok) throw new Error(`test setup: tokenizeOfx failed with ${tokenized.error}`);
  return buildOfxTree(tokenized.tokens);
}

describe('buildOfxTree: basic structure', () => {
  it('builds a leaf-then-aggregate tree from unclosed leaves followed by an aggregate close', () => {
    const result = build('<STMTTRN><TRNAMT>-12.50<FITID>1</STMTTRN>');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.warnings).toEqual([]);
    expect(result.root.children).toEqual([
      {
        name: 'STMTTRN',
        value: null,
        children: [
          { name: 'TRNAMT', value: '-12.50', children: [] },
          { name: 'FITID', value: '1', children: [] },
        ],
      },
    ]);
  });

  it('builds the same tree when every leaf also carries an explicit close tag', () => {
    const result = build('<STMTTRN><TRNAMT>-12.50</TRNAMT><FITID>1</FITID></STMTTRN>');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.warnings).toEqual([]);
    expect(result.root.children).toEqual([
      {
        name: 'STMTTRN',
        value: null,
        children: [
          { name: 'TRNAMT', value: '-12.50', children: [] },
          { name: 'FITID', value: '1', children: [] },
        ],
      },
    ]);
  });

  it('nests aggregates arbitrarily deep', () => {
    const result = build('<A><B><C><D>leaf</D></C></B></A>');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.root.children).toEqual([
      {
        name: 'A',
        value: null,
        children: [
          {
            name: 'B',
            value: null,
            children: [{ name: 'C', value: null, children: [{ name: 'D', value: 'leaf', children: [] }] }],
          },
        ],
      },
    ]);
  });
});

describe('buildOfxTree: warnings', () => {
  it('records malformed-close for a stray closing tag and ignores it', () => {
    const result = build('<A>1</NOTOPEN></A>');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.warnings).toEqual(['malformed-close']);
    expect(result.root.children).toEqual([{ name: 'A', value: '1', children: [] }]);
  });

  it('closes an unclosed aggregate at EOF with unclosed-aggregate', () => {
    const result = build('<A><B>1');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.warnings).toEqual(['unclosed-aggregate']);
    expect(result.root.children).toEqual([{ name: 'A', value: null, children: [{ name: 'B', value: '1', children: [] }] }]);
  });

  it('records one unclosed-aggregate warning for each aggregate popped above a matched close', () => {
    // <A><B><C>1</A> -- </A> pops C and B (each with a warning) before matching A.
    const result = build('<A><B><C>1</A>');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.warnings).toEqual(['unclosed-aggregate']);
    expect(result.root.children).toEqual([
      { name: 'A', value: null, children: [{ name: 'B', value: null, children: [{ name: 'C', value: '1', children: [] }] }] },
    ]);
  });

  it('de-duplicates repeated warning codes into a single entry each', () => {
    const result = build('<A><B><C>1</A><D>2</NOTOPEN>');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.warnings.sort()).toEqual(['malformed-close', 'unclosed-aggregate']);
  });
});

describe('buildOfxTree: budgets', () => {
  it('rejects more than 20,000 leaf elements with too-large', () => {
    const tokens: OfxToken[] = [];
    for (let i = 0; i < 20_001; i += 1) {
      tokens.push({ t: 'open', name: 'X' }, { t: 'text', value: '1' });
    }
    expect(buildOfxTree(tokens)).toEqual({ ok: false, error: 'too-large' });
  });

  it('rejects more than 20,000 aggregate (non-leaf) elements with too-large', () => {
    const tokens: OfxToken[] = [];
    for (let i = 0; i < 20_001; i += 1) {
      tokens.push({ t: 'open', name: 'X' }, { t: 'close', name: 'X' });
    }
    expect(buildOfxTree(tokens)).toEqual({ ok: false, error: 'too-large' });
  });

  it('accepts exactly 20,000 elements', () => {
    const tokens: OfxToken[] = [];
    for (let i = 0; i < 20_000; i += 1) {
      tokens.push({ t: 'open', name: 'X' }, { t: 'text', value: '1' });
    }
    const result = buildOfxTree(tokens);
    expect(result.ok).toBe(true);
  });

  it('rejects a stack deeper than 64 with too-deep', () => {
    const tokens: OfxToken[] = [];
    for (let i = 0; i < 65; i += 1) tokens.push({ t: 'open', name: `A${i}` });
    expect(buildOfxTree(tokens)).toEqual({ ok: false, error: 'too-deep' });
  });

  it('accepts a stack exactly 64 deep', () => {
    const tokens: OfxToken[] = [];
    for (let i = 0; i < 64; i += 1) tokens.push({ t: 'open', name: `A${i}` });
    const result = buildOfxTree(tokens);
    expect(result.ok).toBe(true);
  });
});

describe('buildOfxTree: stray/text edge cases', () => {
  it('drops a text token with no preceding open (nothing to attach to)', () => {
    const tokens: OfxToken[] = [{ t: 'text', value: 'orphan' }, { t: 'open', name: 'A' }, { t: 'text', value: '1' }];
    const result = buildOfxTree(tokens);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.root.children).toEqual([{ name: 'A', value: '1', children: [] }]);
  });

  it('treats an open with no following token as an (immediately unclosed) aggregate', () => {
    const tokens: OfxToken[] = [{ t: 'open', name: 'A' }];
    const result = buildOfxTree(tokens);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.warnings).toEqual(['unclosed-aggregate']);
    expect(result.root.children).toEqual([{ name: 'A', value: null, children: [] }]);
  });
});

describe('findAll / child / childText', () => {
  const tree = build('<BANKTRANLIST><STMTTRN><FITID>1</STMTTRN><STMTTRN><FITID>2</STMTTRN></BANKTRANLIST>');

  it('findAll returns every match in document order at any depth', () => {
    expect(tree.ok).toBe(true);
    if (!tree.ok) return;
    const matches = findAll(tree.root, 'STMTTRN');
    expect(matches.map((m) => childText(m, 'FITID'))).toEqual(['1', '2']);
  });

  it('findAll returns an empty array when nothing matches', () => {
    expect(tree.ok).toBe(true);
    if (!tree.ok) return;
    expect(findAll(tree.root, 'NOPE')).toEqual([]);
  });

  it('child returns the direct child element, not a grandchild', () => {
    expect(tree.ok).toBe(true);
    if (!tree.ok) return;
    const list = child(tree.root, 'BANKTRANLIST') as OfxNode;
    expect(list.name).toBe('BANKTRANLIST');
    expect(child(tree.root, 'STMTTRN')).toBeNull();
  });

  it('childText returns null for a missing child', () => {
    expect(tree.ok).toBe(true);
    if (!tree.ok) return;
    expect(childText(tree.root, 'NOPE')).toBeNull();
  });

  it('childText returns null when the matching child is an aggregate, not a leaf', () => {
    expect(tree.ok).toBe(true);
    if (!tree.ok) return;
    expect(childText(tree.root, 'BANKTRANLIST')).toBeNull();
  });
});

describe('serialisation equivalence (SGML unclosed/closed, XML, single-line, CRLF, random whitespace)', () => {
  const leaves: readonly [string, string][] = [
    ['TRNTYPE', 'DEBIT'],
    ['DTPOSTED', '20260912'],
    ['TRNAMT', '-12.50'],
    ['FITID', '1001'],
    ['NAME', 'TESCO STORES'],
  ];

  function canonicalTree(): OfxNode {
    const result = build(
      `<STMTTRN>${leaves.map(([tag, value]) => `<${tag}>${value}</${tag}>`).join('')}</STMTTRN>`
    );
    if (!result.ok) throw new Error('test setup failed');
    return result.root;
  }

  it('SGML with unclosed leaves matches the canonical (closed-leaf) tree', () => {
    const body = `<STMTTRN>${leaves.map(([tag, value]) => `<${tag}>${value}`).join('')}</STMTTRN>`;
    const result = build(body);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.root).toEqual(canonicalTree());
  });

  it('XML-style (every leaf closed) matches the canonical tree', () => {
    const body = `<STMTTRN>${leaves.map(([tag, value]) => `<${tag}>${value}</${tag}>`).join('')}</STMTTRN>`;
    const result = build(body);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.root).toEqual(canonicalTree());
  });

  it('single-line vs. CRLF-separated renderings match the canonical tree', () => {
    const singleLine = `<STMTTRN>${leaves.map(([tag, value]) => `<${tag}>${value}</${tag}>`).join('')}</STMTTRN>`;
    const crlf = `<STMTTRN>\r\n${leaves.map(([tag, value]) => `<${tag}>${value}</${tag}>`).join('\r\n')}\r\n</STMTTRN>`;
    const a = build(singleLine);
    const b = build(crlf);
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) {
      expect(a.root).toEqual(canonicalTree());
      expect(b.root).toEqual(canonicalTree());
    }
  });

  it('random inter-tag whitespace never changes the resulting tree (property)', () => {
    const wsChars = [' ', '\t', '\n', '\r'];
    fc.assert(
      fc.property(fc.array(fc.integer({ min: 0, max: 3 }), { minLength: leaves.length, maxLength: leaves.length }), (counts) => {
        const parts: string[] = ['<STMTTRN>'];
        leaves.forEach(([tag, value], idx) => {
          const pad = (wsChars[counts[idx] as number] as string).repeat(2);
          parts.push(pad, `<${tag}>${value}</${tag}>`);
        });
        parts.push('</STMTTRN>');
        const body = parts.join('');
        const result = build(body);
        expect(result.ok).toBe(true);
        if (result.ok) expect(result.root).toEqual(canonicalTree());
      }),
      { numRuns: 50 }
    );
  });
});

describe('no-leak', () => {
  it('never throws, and its warnings (enum codes only) never carry the payee text', () => {
    // NAME is never opened -- </NAME> is stray, and the un-swallowed </A>
    // (separated from A's leaf text by that stray close) is stray too.
    const body = '<A>DR JONES PHARMACY</NAME></A>';
    expect(() => build(body)).not.toThrow();
    const result = build(body);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.warnings).toEqual(['malformed-close']);
      expect(JSON.stringify(result.warnings)).not.toContain('JONES');
    }
  });
});

describe('barrel', () => {
  it('re-exports buildOfxTree, findAll, child and childText', () => {
    expect(ofxBarrel.buildOfxTree).toBe(buildOfxTree);
    expect(ofxBarrel.findAll).toBe(findAll);
    expect(ofxBarrel.child).toBe(child);
    expect(ofxBarrel.childText).toBe(childText);
  });
});
