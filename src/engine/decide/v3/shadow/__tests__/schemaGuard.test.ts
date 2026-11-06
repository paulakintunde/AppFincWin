// 05.4-36 BO-08: everything a shadow row can carry is accepted by the newest CHECK that defines it. Reads the migration files
// as text (tests may read files). Fails when the engine's codes or variants and the migration lists drift.
import * as fs from 'fs';
import * as path from 'path';
import { CODE_PRECEDENCE } from '../../constants';
import { CODES, VARIANTS } from '../../__tests__/rightAnswers/schema';
import type { Code, Variant } from '../../types';
import { DECIDE_ENGINE_REVISION } from '../revision';
import { SHADOW_SAMPLE_IDS } from '../samples';

const MIGRATIONS = path.join(__dirname, '../../../../../../supabase/migrations');
const files = fs
  .readdirSync(MIGRATIONS)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => ({ name: f, text: fs.readFileSync(path.join(MIGRATIONS, f), 'utf8') }));

/** The quoted values of the last `<pattern> (...)` list in the newest file that mentions `table` and has one. */
function newestList(table: string, pattern: RegExp): { file: string; values: string[] } {
  let found: { file: string; values: string[] } | null = null;
  for (const f of files) {
    if (!f.text.includes(table)) continue;
    const matches = [...f.text.matchAll(new RegExp(`${pattern.source}\\s*\\(([^)]*)\\)`, 'g'))];
    const last = matches[matches.length - 1];
    if (last?.[1] !== undefined) found = { file: f.name, values: [...last[1].matchAll(/'([^']+)'/g)].map((m) => m[1] as string) };
  }
  if (found === null) throw new Error(`no ${pattern.source} list for ${table}`);
  return found;
}

// Compile-time: the runtime lists cover exactly the type unions.
const codeTypeCheck: readonly Code[] = CODE_PRECEDENCE;
const variantTypeCheck: readonly Variant[] = VARIANTS;
type Exhaustive<T, L extends readonly T[]> = Exclude<T, L[number]> extends never ? true : false;
const codesExhaustive: Exhaustive<Code, typeof CODE_PRECEDENCE> = true;
const variantsExhaustive: Exhaustive<Variant, typeof VARIANTS> = true;

describe('shadow rows fit the stored CHECKs', () => {
  it('the engine lists match the type unions', () => {
    expect(codesExhaustive && variantsExhaustive).toBe(true);
    expect([...codeTypeCheck].sort()).toEqual([...CODES].sort());
    expect(variantTypeCheck.length).toBe(VARIANTS.length);
  });

  it('every Code is in the decide_shadow_runs code CHECK', () => {
    const { values } = newestList('decide_shadow_runs', /\bcode in/);
    expect(CODE_PRECEDENCE.filter((c) => !values.includes(c))).toEqual([]);
  });

  it('every Variant is in the newest decide_shadow_runs variant CHECK', () => {
    const list = newestList('decide_shadow_runs', /\bvariant in/);
    expect(list.file >= '20261103001000').toBe(true);
    expect(VARIANTS.filter((v) => !list.values.includes(v))).toEqual([]);
  });

  it('every Code is in the newest decide_checks answer_v3 CHECK', () => {
    const { values } = newestList('decide_checks_answer_v3_shape', /->> 'code' in/);
    expect(CODE_PRECEDENCE.filter((c) => !values.includes(c))).toEqual([]);
  });

  it('the sample ids equal the sample_id CHECK', () => {
    const { values } = newestList('decide_shadow_runs', /\bsample_id in/);
    expect(values).toEqual([...SHADOW_SAMPLE_IDS]);
  });

  it('the revision fits the engine_revision CHECK', () => {
    expect(DECIDE_ENGINE_REVISION).toMatch(/^[a-z0-9._-]{1,40}$/);
  });
});
