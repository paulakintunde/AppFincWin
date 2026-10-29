// D-53, one source of truth (static): the v3 snapshot folder maps the app's existing data and keeps no Decide-only copy of
// accounts, transactions, series, envelopes, goals or debts. Reads the non-test sources and checks them as text.
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

const DIR = join(__dirname, '..');
const FORBIDDEN = [/supabase/i, /\.from\(/, /AsyncStorage/, /SecureStore/, /\bfetch\(/];
const ALLOWED_IMPORT = /^(@\/engine\/decide\/v3|@\/engine\/money|@\/engine\/payoff|@\/engine\/recurring|\.\.\/(buildSnapshot|conversion|types|checkInputs|checkCurrency)|@\/db\/(decideSettings|decideAnswers|recurringDismissals)|@\/features\/income\/notPay|\.\/[\w-]+)$/; // the three db row types settingsSource reads (import type only); notPay is the pure not-pay key check
const COPY_FIELD = /^(accounts|transactions|rows|series|envelopes|goals|pots|debts|balance|balances)$/i;

/** Problems found in one source text; [] = clean. */
function problems(text: string): string[] {
  const out: string[] = [];
  for (const f of FORBIDDEN) if (f.test(text)) out.push(`forbidden ${f}`);
  for (const m of text.matchAll(/from '([^']+)'/g)) if (!ALLOWED_IMPORT.test(m[1]!)) out.push(`import ${m[1]}`);
  return out;
}

const sources = readdirSync(DIR)
  .filter((f) => f.endsWith('.ts'))
  .map((f) => ({ f, text: readFileSync(join(DIR, f), 'utf8') }));

describe('D-53: the v3 snapshot keeps no Decide-only copy of app data', () => {
  it('finds the v3 source files', () => {
    expect(sources.map((s) => s.f)).toEqual(expect.arrayContaining(['buildV3Inputs.ts', 'computeV3.ts', 'types.ts']));
  });

  it.each(sources)('$f calls no storage or network and imports only the allowed modules', ({ text }) => {
    expect(problems(text)).toEqual([]);
  });

  it('V3SettingsSource declares no field that copies accounts, transactions, series, envelopes, goals or debts', () => {
    const types = sources.find((s) => s.f === 'types.ts')!.text;
    const body = /export interface V3SettingsSource \{([\s\S]*?)\n\}/.exec(types)![1]!;
    const names = [...body.matchAll(/^\s*(\w+)\??:/gm)].map((m) => m[1]!);
    expect(names.length).toBeGreaterThan(5);
    expect(names.filter((n) => COPY_FIELD.test(n))).toEqual([]);
  });

  it('self-check: the same rules reject a stored copy and a network call', () => {
    expect(problems("const a = await supabase.from('accounts').select();")).not.toEqual([]);
    expect(problems("import { x } from '@/db/rows';")).toEqual(["import @/db/rows"]);
    expect(COPY_FIELD.test('accounts')).toBe(true);
  });
});
