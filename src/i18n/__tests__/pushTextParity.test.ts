// 10-23: the Edge Function cannot import the app catalogue, so it carries a copy of the push templates.
// This test keeps the copy equal to system.push.* in the catalogue.
import { readFileSync } from 'fs';
import { join } from 'path';

import { push } from '../locales/system/push';

function templatesFromText(): Record<string, string> {
  const src = readFileSync(join(__dirname, '..', '..', '..', 'supabase', 'functions', 'alerts-deliver', 'text.ts'), 'utf8');
  const block = /export const TEMPLATES = \{([\s\S]*?)\} as const;/.exec(src);
  if (!block) throw new Error('TEMPLATES not found in text.ts');
  const out: Record<string, string> = {};
  for (const m of block[1].matchAll(/^\s*(\w+):\s*'((?:[^'\\]|\\.)*)',?\s*$/gm)) out[m[1]] = m[2].replace(/\\'/g, "'");
  return out;
}

describe('push text parity (10-23)', () => {
  it('text.ts TEMPLATES equal the app catalogue system.push strings', () => {
    expect(templatesFromText()).toEqual({ ...push });
  });
});
