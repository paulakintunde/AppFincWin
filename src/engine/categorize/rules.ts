/**
 * User category rules (REC-27): resolution of stored personal and shared
 * rules into per-member category ids (D-26). Pure; i18n display names are
 * supplied by the caller.
 */
import { SYSTEM_CATEGORY_KEYS, type BuiltinCategoryKey } from './builtins';
import { normaliseDescription, type ResolvedRule } from './guessCategory';

export const RULE_KEYWORD_MAX = 60;

export type RuleScope = 'personal' | 'shared';
export type RuleTarget =
  | { kind: 'category'; categoryId: string }
  | { kind: 'builtin'; key: BuiltinCategoryKey }
  | { kind: 'name'; name: string };

export interface StoredRule {
  id: string;
  scope: RuleScope;
  keywordNorm: string;
  target: RuleTarget;
}

/** A member's category as the resolver sees it; displayName is the caller's categoryName(). */
export interface MemberCategory {
  id: string;
  builtinKey: string | null;
  displayName: string;
  active: boolean;
  system: boolean;
}

export interface ResolvedRules {
  personal: ResolvedRule[];
  shared: ResolvedRule[];
  byRuleId: Map<string, string>;
  unresolvedIds: Set<string>;
}

export function normaliseRuleKeyword(raw: string): string {
  return normaliseDescription(raw);
}

function isSystemKey(key: string): boolean {
  return (SYSTEM_CATEGORY_KEYS as readonly string[]).includes(key);
}

/** The shared-rule target for a category: built-in by key, custom by name, system never. */
export function sharedTargetFor(c: { builtinKey: string | null; displayName: string }): RuleTarget | null {
  if (c.builtinKey === null) return { kind: 'name', name: c.displayName };
  if (isSystemKey(c.builtinKey)) return null;
  return { kind: 'builtin', key: c.builtinKey as BuiltinCategoryKey };
}

function lowestId(list: readonly MemberCategory[]): string | undefined {
  let best: string | undefined;
  for (const c of list) {
    if (best === undefined || c.id < best) best = c.id;
  }
  return best;
}

function resolveTarget(target: RuleTarget, eligible: readonly MemberCategory[]): string | undefined {
  switch (target.kind) {
    case 'category':
      return eligible.find((c) => c.id === target.categoryId)?.id;
    case 'builtin':
      return lowestId(eligible.filter((c) => c.builtinKey === target.key));
    case 'name': {
      const wanted = normaliseDescription(target.name);
      return lowestId(eligible.filter((c) => normaliseDescription(c.displayName) === wanted));
    }
  }
}

export function resolveRules(rules: readonly StoredRule[], categories: readonly MemberCategory[]): ResolvedRules {
  const eligible = categories.filter((c) => c.active && !c.system);
  const out: ResolvedRules = { personal: [], shared: [], byRuleId: new Map(), unresolvedIds: new Set() };
  for (const rule of rules) {
    const categoryId = rule.keywordNorm === '' ? undefined : resolveTarget(rule.target, eligible);
    if (categoryId === undefined) {
      out.unresolvedIds.add(rule.id);
      continue;
    }
    out[rule.scope].push({ keywordNorm: rule.keywordNorm, categoryId });
    out.byRuleId.set(rule.id, categoryId);
  }
  return out;
}

export function hasRuleFor(rules: readonly ResolvedRule[], keywordNorm: string, categoryId: string): boolean {
  return rules.some((r) => r.keywordNorm === keywordNorm && r.categoryId === categoryId);
}
