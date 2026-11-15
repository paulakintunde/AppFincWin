/**
 * 06.1-22 (D-19, D49, D50): the "Your money rules" document stored under decide_settings.custom_options.rules. Pure: no React,
 * no I/O. Lives in the v3 snapshot so settingsSource reads it without importing a screen (D-53 one-source rule); the home cards
 * model re-exports it.
 */

export const MAX_OWN_RULES = 5;
export const MAX_RULE_PERCENT = 100;

export type OwnRuleKind = 'keep' | 'largest' | 'category_cap' | 'category_share';

export interface StoredRule {
  readonly id: string;
  readonly kind: OwnRuleKind;
  readonly on: boolean;
  /** Minor units for keep, largest and category_cap; whole percent of pay for category_share. */
  readonly value: number;
  /** category_cap and category_share only. */
  readonly categoryId: string | null;
}

export interface RulesDoc {
  readonly v: 1;
  readonly rules: readonly StoredRule[];
}

export const EMPTY_RULES: RulesDoc = { v: 1, rules: [] };

const KINDS: readonly OwnRuleKind[] = ['keep', 'largest', 'category_cap', 'category_share'];
const isRec = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

function storedRuleOf(x: unknown): StoredRule | null {
  if (!isRec(x)) return null;
  const kind = KINDS.find((k) => k === x.kind);
  const value = x.value;
  if (typeof x.id !== 'string' || x.id === '' || kind === undefined) return null;
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) return null;
  if (kind === 'category_share' && value > MAX_RULE_PERCENT) return null;
  const categoryId = typeof x.categoryId === 'string' && x.categoryId !== '' ? x.categoryId : null;
  if ((kind === 'category_cap' || kind === 'category_share') && categoryId === null) return null;
  return { id: x.id, kind, on: x.on === true, value, categoryId };
}

/** The rules document inside a custom_options value. Invalid entries, duplicate ids, and entries past the cap are dropped. */
export function readRulesDoc(customOptions: unknown): RulesDoc {
  if (!isRec(customOptions) || !isRec(customOptions.rules) || !Array.isArray(customOptions.rules.rules)) return EMPTY_RULES;
  const seen = new Set<string>();
  const rules: StoredRule[] = [];
  for (const raw of customOptions.rules.rules) {
    const rule = storedRuleOf(raw);
    if (rule === null || seen.has(rule.id) || rules.length >= MAX_OWN_RULES) continue;
    seen.add(rule.id);
    rules.push(rule);
  }
  return { v: 1, rules };
}

/** The new custom_options value: everything already there, with the rules document replaced. */
export function withRulesDoc(customOptions: unknown, doc: RulesDoc): Record<string, unknown> {
  const rest = isRec(customOptions) ? customOptions : {};
  return { ...rest, rules: doc };
}

export function upsertRule(doc: RulesDoc, rule: StoredRule): RulesDoc {
  const has = doc.rules.some((r) => r.id === rule.id);
  if (!has && doc.rules.length >= MAX_OWN_RULES) return doc;
  return { v: 1, rules: has ? doc.rules.map((r) => (r.id === rule.id ? rule : r)) : [...doc.rules, rule] };
}

export function removeRule(doc: RulesDoc, id: string): RulesDoc {
  return { v: 1, rules: doc.rules.filter((r) => r.id !== id) };
}

export function canAddRule(doc: RulesDoc): boolean {
  return doc.rules.length < MAX_OWN_RULES;
}

/** The singleton rules (keep, largest) can be added once each; a category rule can repeat. */
export function kindTaken(doc: RulesDoc, kind: OwnRuleKind): boolean {
  return (kind === 'keep' || kind === 'largest') && doc.rules.some((r) => r.kind === kind);
}

export function newRuleId(kind: OwnRuleKind, doc: RulesDoc): string {
  if (kind === 'keep' || kind === 'largest') return `own_${kind}`;
  let n = doc.rules.length + 1;
  while (doc.rules.some((r) => r.id === `own_${kind}_${n}`)) n += 1;
  return `own_${kind}_${n}`;
}

/** FIN-07: the money-left-each-month line the engine reads. Absent or off = null. */
export function tightLineOf(doc: RulesDoc): number | null {
  const keep = doc.rules.find((r) => r.kind === 'keep' && r.on);
  return keep === undefined ? null : keep.value;
}

/**
 * The own lines in the raw shape the engine builder validates (buildV3Inputs.lineSpecOf). Keep is not a line (it is the tight line),
 * so it is left out here.
 */
export function ownLinesOf(doc: RulesDoc): unknown[] {
  const out: unknown[] = [];
  for (const r of doc.rules) {
    if (r.kind === 'largest') out.push({ id: r.id, on: r.on, spec: { kind: 'single_purchase_cap', cap: r.value } });
    else if (r.kind === 'category_cap') out.push({ id: r.id, on: r.on, spec: { kind: 'category_monthly_cap', categoryId: r.categoryId, cap: r.value } });
    else if (r.kind === 'category_share') out.push({ id: r.id, on: r.on, spec: { kind: 'category_income_share', categoryId: r.categoryId, pct: String(r.value) } });
  }
  return out;
}
