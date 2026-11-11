/**
 * 06.1-19 (D-24, FIN-28): running-cost pre-fills for the big-buy stepper. A recorded bill that matches a line supplies its own
 * amount and how often; otherwise a small dated table of round figures by kind and country fills in, labelled "quick estimates"
 * on screen. A country (or currency) with no table gets lines with amount 0, switched off, for the user to type. Only cars have a
 * table; other kinds pre-fill nothing. Pure: no data layer, no React.
 * The US figures come from the decide spec (D13). Every other table is a draft for the owner's review on the wording page (plan 33).
 */
import { INCLUDED_COUNTRIES, type RunningCostLine } from '@/engine/decide/v3';
import { minorUnits, type MinorUnits } from '@/engine/money';

export type TemplateKey = 'insurance' | 'fuel' | 'maintenance' | 'registration' | 'value_loss';
export type TemplateRegion = 'US' | 'GB' | 'CA' | 'EU';

export interface TemplateLine {
  readonly key: TemplateKey;
  /** Under decide.screens.stepper.running. */
  readonly labelKey: 'insurance' | 'fuel' | 'maintenance' | 'registration' | 'lossOfValue';
  readonly everyMonths: 1 | 12;
  readonly amount: MinorUnits;
  readonly on: boolean;
  /** True until the owner has reviewed the figure on the wording page (plan 33). */
  readonly draft?: true;
}

const m = (n: number): MinorUnits => minorUnits(n);
const line = (key: TemplateKey, labelKey: TemplateLine['labelKey'], everyMonths: 1 | 12, amount: number, on: boolean, draft: boolean): TemplateLine =>
  draft ? { key, labelKey, everyMonths, amount: m(amount), on, draft: true } : { key, labelKey, everyMonths, amount: m(amount), on };

const carLines = (insurance: number, fuel: number, maintenance: number, registration: number, draft: boolean): readonly TemplateLine[] =>
  Object.freeze([
    line('insurance', 'insurance', 1, insurance, true, draft),
    line('fuel', 'fuel', 1, fuel, true, draft),
    line('maintenance', 'maintenance', 12, maintenance, true, draft),
    line('registration', 'registration', 12, registration, true, draft),
    line('value_loss', 'lossOfValue', 12, 0, false, draft),
  ]);

export const RUNNING_COST_TEMPLATES = Object.freeze({
  asOf: '2026-11',
  currencies: Object.freeze({ US: 'USD', GB: 'GBP', CA: 'CAD', EU: 'EUR' } as const),
  kinds: Object.freeze({
    car: Object.freeze({
      US: carLines(14000, 12000, 60000, 15600, false),
      GB: carLines(6000, 9000, 40000, 19000, true),
      CA: carLines(15000, 14000, 80000, 12000, true),
      EU: carLines(6000, 10000, 50000, 20000, true),
    }),
  }),
});

/** Which recorded bills can stand in for which template line: the category names a bill may sit in, and the words its name needs. */
export const TEMPLATE_CATEGORY: Readonly<Record<Exclude<TemplateKey, 'value_loss'>, { categories: readonly string[]; words: readonly string[] }>> = Object.freeze({
  insurance: { categories: ['Insurance', 'Transport'], words: ['insurance'] },
  fuel: { categories: ['Transport'], words: ['fuel', 'gas', 'petrol', 'diesel', 'charging'] },
  maintenance: { categories: ['Transport'], words: ['maintenance', 'service', 'servicing', 'repairs'] },
  registration: { categories: ['Transport', 'Insurance'], words: ['registration', 'licence', 'license'] },
});

/** A car insurance bill must say it is for a vehicle, so a home policy never fills the car line. */
const VEHICLE_WORDS: readonly string[] = ['car', 'auto', 'vehicle', 'motor'];

export interface PrefillBill {
  readonly id: string;
  readonly name: string;
  readonly categoryName: string | null;
  readonly amount: number;
  /** null = not monthly, quarterly or yearly; such a bill is never matched. */
  readonly everyMonths: 1 | 3 | 12 | null;
}

export interface PrefillInput {
  readonly kind: string | null;
  readonly country: string | null;
  readonly currency: string;
  readonly bills: readonly PrefillBill[];
  /** 'YYYY-MM-DD': when the costs start (the day of the purchase). */
  readonly start: string;
}

export interface PrefilledLine {
  readonly key: TemplateKey;
  readonly labelKey: TemplateLine['labelKey'];
  readonly source: 'records' | 'quick_estimate';
  readonly draft: boolean;
  readonly billId: string | null;
  readonly line: RunningCostLine;
}

export function templateRegionOf(country: string | null): TemplateRegion | null {
  if (country === null) return null;
  if (country === 'US' || country === 'GB' || country === 'CA') return country;
  return INCLUDED_COUNTRIES.includes(country) ? 'EU' : null;
}

function words(text: string): string[] {
  return text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 0);
}

function matchingBill(key: TemplateKey, bills: readonly PrefillBill[]): { bill: PrefillBill; every: 1 | 3 | 12 } | null {
  if (key === 'value_loss') return null;
  const rule = TEMPLATE_CATEGORY[key];
  for (const b of bills) {
    if (b.everyMonths === null || b.amount <= 0) continue;
    if (b.categoryName !== null && !rule.categories.includes(b.categoryName)) continue;
    const ws = words(b.name);
    if (!rule.words.some((w) => ws.includes(w))) continue;
    if (key === 'insurance' && !VEHICLE_WORDS.some((w) => ws.includes(w))) continue;
    return { bill: b, every: b.everyMonths };
  }
  return null;
}

/** The running-cost lines to start from: a matching recorded bill first, then the dated table. Home and other kinds return []. */
export function prefillRunningCosts(input: PrefillInput): PrefilledLine[] {
  if (input.kind !== 'car') return [];
  const region = templateRegionOf(input.country);
  const table = region !== null && RUNNING_COST_TEMPLATES.currencies[region] === input.currency ? RUNNING_COST_TEMPLATES.kinds.car[region] : null;
  const base: readonly TemplateLine[] = table ?? RUNNING_COST_TEMPLATES.kinds.car.US.map((l) => ({ ...l, amount: m(0), on: false }));
  return base.map((tpl): PrefilledLine => {
    const hit = matchingBill(tpl.key, input.bills);
    const id = `rc:${tpl.key}`;
    if (hit !== null) {
      return { key: tpl.key, labelKey: tpl.labelKey, source: 'records', draft: false, billId: hit.bill.id, line: { id, amount: m(hit.bill.amount), everyMonths: hit.every, start: input.start, end: null, on: true } };
    }
    return { key: tpl.key, labelKey: tpl.labelKey, source: 'quick_estimate', draft: table !== null && tpl.draft === true, billId: null, line: { id, amount: tpl.amount, everyMonths: tpl.everyMonths, start: input.start, end: null, on: tpl.on } };
  });
}
