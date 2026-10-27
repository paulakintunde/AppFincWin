/**
 * The loader for the variable-income, account and readiness goldens (05.1-48, W9). Every case's person must exist, every
 * patch and field name must be one the loader knows, and the case must load through adapter.ts and evaluate without a throw.
 * `-t ines`, `-t gabe`, `-t vic`, `-t dee` and `-t rae` select one person.
 */
import { evaluate } from '../evaluate';
import { loadAllVariableCases, resolveVariablePerson, variablePersons, type LoadedCase, type VariableCase } from './golden/variableIncomeLoader';
import file from './golden/variable-income.json';

const RAW = (file as unknown as { cases: VariableCase[] }).cases;

export function loadVariableCases(): LoadedCase[] {
  return loadAllVariableCases();
}

const CASES = loadVariableCases();
const byPerson = (id: string): LoadedCase[] => CASES.filter((c) => c.person === id);

describe('variable-income fixture file', () => {
  it('has unique case ids and a person for every case', () => {
    expect(new Set(RAW.map((c) => c.id)).size).toBe(RAW.length);
    const ids = new Set(variablePersons().map((p) => p.id));
    for (const c of RAW) expect(ids.has(c.person)).toBe(true);
  });

  it('every case states its working in words', () => {
    for (const c of CASES) expect({ id: c.id, ok: c.working.length >= 40 }).toEqual({ id: c.id, ok: true });
  });

  it('rejects an unknown person, case key, expect key, series, line, month, envelope and account', () => {
    const base = RAW[0] as VariableCase;
    expect(() => resolveVariablePerson({ ...base, person: 'nobody' })).toThrow(RangeError);
    expect(() => resolveVariablePerson({ ...base, bogus: 1 } as unknown as VariableCase)).toThrow(/unknown key/);
    expect(() => resolveVariablePerson({ ...base, expect: { ...base.expect, bogus: 1 } as VariableCase['expect'] })).toThrow(/unknown key/);
    expect(() => resolveVariablePerson({ ...base, seriesPatch: [{ id: 'nope', amount: 1 }] })).toThrow(/unknown series/);
    expect(() => resolveVariablePerson({ ...base, removeLines: ['nope'] })).toThrow(/unknown line/);
    expect(() => resolveVariablePerson({ ...base, monthsPatch: [{ month: '1999-01', full: false }] })).toThrow(/unknown month/);
    expect(() => resolveVariablePerson({ ...base, envelopesPatch: [{ id: 'nope', accountId: null }] })).toThrow(/unknown envelope/);
    expect(() => resolveVariablePerson({ ...base, accountsPatch: [{ id: 'nope', use: null }] })).toThrow(/does not state/);
    const dee = RAW.find((c) => c.person === 'dee') as VariableCase;
    expect(() => resolveVariablePerson({ ...dee, accountsPatch: [{ id: 'nope', use: null }] })).toThrow(/unknown account/);
    expect(() => resolveVariablePerson({ ...base, profilePatch: { pattern: null }, person: 'rae' })).toThrow(/does not have/);
  });
});

describe.each(['ines', 'gabe', 'vic', 'dee', 'rae'])('%s cases load through adapter.ts and evaluate', (person) => {
  it('has cases', () => {
    expect(byPerson(person).length).toBeGreaterThan(0);
  });

  it.each(byPerson(person).map((c) => [c.id, c] as const))('%s', (_id, c) => {
    expect(() => evaluate(c.inputs, c.check)).not.toThrow();
  });
});
