/**
 * 05.3-18: every engine golden case goes through heroModel and the real en.ts copy. No sentence may keep a '{{',
 * and none may read 'undefined' or 'NaN'. Engine test fixtures are imported by relative path (tests only).
 */
import i18next from 'i18next';
import en from '@/i18n/locales/en';
import { evaluate } from '@/engine/decide/v3';
import type { Evaluation } from '@/engine/decide/v3';
import extraFile from '../../../../../engine/decide/v3/__tests__/golden/extra-d18.json';
import refundsFile from '../../../../../engine/decide/v3/__tests__/golden/refunds.json';
import scenariosFile from '../../../../../engine/decide/v3/__tests__/golden/scenarios22.json';
import {
  resolveScenarioPerson,
  toCheckV2,
  toV3Inputs,
  withMainBalance,
  type FixtureScenario,
} from '../../../../../engine/decide/v3/__tests__/golden/adapter';
import { loadAllVariableCases } from '../../../../../engine/decide/v3/__tests__/golden/variableIncomeLoader';
import { heroModel, EMERGENCY_NO_REBUILD_KEY, NOT_COVERED_NO_DATE_KEY, type HeroParam } from '../hero';

jest.setTimeout(60000);

const SCENARIOS = (scenariosFile as unknown as { scenarios: FixtureScenario[] }).scenarios;
const EXTRAS = (extraFile as unknown as { scenarios: FixtureScenario[] }).scenarios;
const REFUNDS = (refundsFile as unknown as { scenarios: FixtureScenario[] }).scenarios;

const OWN_PET = {
  itemTypes: [{ id: 'pet', base: 'general', questionIds: [], ownQuestions: [{ id: 'food', label: 'Food', cadence: 'monthly', cash: true }] }],
  purposes: [],
  cadences: [],
  incomeKinds: [],
};

function evaluateScenario(s: FixtureScenario): Evaluation {
  const person = resolveScenarioPerson(s);
  const own = s.id === '22';
  const over = own ? { custom: OWN_PET as never } : {};
  const inputs = toV3Inputs(s.id === '14' ? withMainBalance(person, 300000) : person, over);
  const check = toCheckV2(s.purchase);
  return evaluate(inputs, own ? { ...check, itemType: { kind: 'custom', id: 'pet' } } : check);
}

const CASES: { name: string; ev: Evaluation }[] = [
  ...[...SCENARIOS, ...EXTRAS, ...REFUNDS].map((s) => ({ name: `scenario ${s.id}`, ev: evaluateScenario(s) })),
  ...loadAllVariableCases().map((c) => ({ name: `variable ${c.id}`, ev: evaluate(c.inputs, c.check) })),
];

// Simple stubs standing in for useV3Format.
function format(p: HeroParam): string {
  switch (p.kind) {
    case 'money':
      return `$${(p.minor / 100).toFixed(2)}`;
    case 'month':
      return `M${p.ym}`;
    case 'date':
      return `D${p.iso}`;
    case 'count':
      return String(p.n);
  }
}

let t: (key: string, params?: Record<string, string>) => string;
beforeAll(async () => {
  const instance = i18next.createInstance();
  await instance.init({ lng: 'en', resources: { en: { translation: en } }, interpolation: { escapeValue: false }, returnNull: false });
  t = (key, params) => instance.t(key, params) as string;
});

function render(key: string, params: Readonly<Record<string, HeroParam>>): string {
  const flat: Record<string, string> = {};
  for (const [k, v] of Object.entries(params)) flat[k] = format(v);
  return t(key, flat);
}

describe('hero golden: every engine case renders a complete sentence', () => {
  it('has cases', () => {
    expect(CASES.length).toBeGreaterThan(0);
  });

  it.each(CASES.map((c) => [c.name, c.ev] as const))('%s', (_name, ev) => {
    const hero = heroModel(ev);
    if (hero.bodyKey === NOT_COVERED_NO_DATE_KEY || hero.bodyKey === EMERGENCY_NO_REBUILD_KEY) {
      // That copy lands in 05.3-09: key equality only.
      expect(hero.bodyKey).toMatch(/^decide\.v3\.ui\.answer\./);
    } else {
      const body = render(hero.bodyKey, hero.params);
      expect(body).not.toContain('{{');
      expect(body).not.toContain('undefined');
      expect(body).not.toContain('NaN');
      expect(body).not.toBe(hero.bodyKey);
    }
    for (const key of [hero.chipKey, hero.titleKey]) {
      const text = render(key, hero.params);
      expect(text).not.toContain('{{');
      expect(text).not.toContain('undefined');
      expect(text).not.toContain('NaN');
      expect(text).not.toBe(key);
    }
  });
});
