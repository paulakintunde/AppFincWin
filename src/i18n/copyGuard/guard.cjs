'use strict';
// 05.5-03 (D-14, CMP-F09): per-sentence copy guard. Plain CommonJS so jest, TypeScript and the ESLint config can all load it.
// Pure: no I/O, no React, no app imports.
const rules = require('./rules.json');

const NOT_A_NUMBER = rules.notANumber;

const sets = rules.sets.map((set) => ({
  name: set.name,
  prefixes: set.prefixes,
  banned: set.banned.map((b) => {
    const pattern = typeof b === 'string' ? b : b.pattern;
    const flags = typeof b === 'string' ? 'i' : b.flags;
    return new RegExp(pattern, flags);
  }),
  limits: set.limits || null,
}));

function setFor(path) {
  for (const set of sets) {
    if (set.prefixes.some((p) => path.startsWith(p))) return set;
  }
  return sets[sets.length - 1];
}

/** Splits on sentence ends followed by whitespace, so "1.5%" stays whole. */
function splitSentences(value) {
  return String(value)
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function wordsIn(sentence) {
  return sentence.split(/\s+/).filter((w) => /\w/.test(w)).length;
}

/** Digits and numeric placeholders. A range like "3 to 6" is one figure; name-like placeholders do not count. */
function numbersIn(sentence) {
  const ranged = sentence.replace(/\d+\s+to\s+\d+/g, 'N');
  const placeholders = [...ranged.matchAll(/\{\{(\w+)\}\}/g)].filter((m) => !Object.prototype.hasOwnProperty.call(NOT_A_NUMBER, m[1])).length;
  const digits = (ranged.replace(/\{\{\w+\}\}/g, ' ').match(/\d[\d,.]*/g) || []).length + (ranged.match(/\bN\b/g) || []).length;
  return placeholders + digits;
}

/** FNV-1a 32-bit, hex, 8 chars. */
function hashSentence(sentence) {
  let h = 0x811c9dc5;
  for (let i = 0; i < sentence.length; i += 1) {
    h ^= sentence.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/** Returns violations { path, sentence, rule, set } for one sentence (hash is added by checkString). */
function checkSentence(path, sentence) {
  const set = setFor(path);
  const out = [];
  const spans = [];
  for (const re of set.banned) {
    const m = re.exec(sentence);
    if (!m) continue;
    const start = m.index;
    const end = m.index + m[0].length;
    // A later pattern whose match sits inside an earlier reported match adds nothing ("you should" vs "should").
    if (spans.some(([s, e]) => start >= s && end <= e)) continue;
    spans.push([start, end]);
    out.push({ path, sentence, rule: `banned:${m[0].toLowerCase()}`, set: set.name });
  }
  if (set.limits && set.limits.prefixes.some((p) => path.startsWith(p))) {
    if (wordsIn(sentence) > set.limits.maxWords) out.push({ path, sentence, rule: 'limit:words', set: set.name });
    if (numbersIn(sentence) > set.limits.maxNumbers) out.push({ path, sentence, rule: 'limit:numbers', set: set.name });
  }
  return out;
}

function checkString(path, value) {
  return splitSentences(value).flatMap((sentence) => {
    const hash = hashSentence(sentence);
    return checkSentence(path, sentence).map((v) => ({ ...v, hash }));
  });
}

function matches(entry, v) {
  return entry.path === v.path && entry.sentenceHash === v.hash && entry.rule === v.rule;
}

function isAllowed(violation, allowlist) {
  return allowlist.entries.some((e) => matches(e, violation));
}

/** Allowlist entries that match no current violation. They must be removed. */
function staleEntries(violations, allowlist) {
  return allowlist.entries.filter((e) => !violations.some((v) => matches(e, v)));
}

module.exports = { splitSentences, checkSentence, checkString, isAllowed, staleEntries, hashSentence };
