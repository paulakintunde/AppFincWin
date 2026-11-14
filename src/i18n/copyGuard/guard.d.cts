export interface Violation {
  path: string;
  sentence: string;
  hash: string;
  rule: string;
  set: string;
}

export interface AllowEntry {
  path: string;
  sentenceHash: string;
  rule: string;
  dated: string;
  reason: string;
}

export interface Allowlist {
  dated: string;
  emptyBy: string;
  entries: AllowEntry[];
}

export function splitSentences(value: string): string[];
export function checkSentence(path: string, sentence: string): Omit<Violation, 'hash'>[];
export function checkString(path: string, value: string): Violation[];
export function isAllowed(violation: Violation, allowlist: Allowlist): boolean;
export function staleEntries(violations: Violation[], allowlist: Allowlist): AllowEntry[];
export function hashSentence(sentence: string): string;
