import * as Server from '../../../../../supabase/functions/read-pdf-statement/contract';
import * as Engine from '../types';

describe('wire contract parity with the Edge Function', () => {
  it.each(['PDF_MAX_PAGES', 'PDF_MAX_BYTES', 'PDF_MAX_ITEMS', 'PDF_MAX_ITEM_CHARS', 'PDF_PASSWORD_MAX', 'STATEMENT_BUCKET'] as const)('%s is identical', (name) => {
    expect(Engine[name]).toBe(Server[name]);
  });

  it('the engine mirror exposes no constant the server lacks', () => {
    expect(Object.keys(Engine).every((k) => k in Server)).toBe(true);
  });

  it('STATEMENT_PATH_RE is defined by the server only and has the expected shape', () => {
    expect(Server.STATEMENT_PATH_RE.source).toContain('\\.pdf$');
    expect(Server.STATEMENT_PATH_RE.test('3f2b8c1e-0a4d-4e5f-9b6a-1c2d3e4f5a6b/3f2b8c1e-0a4d-4e5f-9b6a-1c2d3e4f5a6b.pdf')).toBe(true);
  });
});
