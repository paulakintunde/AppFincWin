// 06.1-81 (review item 3, owner RV-3 "keep the first answer"): a short fingerprint of what the person put into a check (item,
// price, kind, pay way, plan, costs, answers). It is stored beside the answer in answer_v3, so reopening a check can tell an edit
// (the fingerprint moved: store the new answer) from a recompute on newer records (same fingerprint: keep the stored answer, and
// "Changed since you looked" compares with it). Step bookkeeping (which steps were visited or skipped) is not an edit.
import { toStoredV2, type CheckV2 } from '@/engine/decide/v3';

// The same keys as KEY_VISITED and KEY_SKIPPED in check/useStepCheck.ts, named here so this pure module reads no hooks.
const BOOKKEEPING: readonly string[] = ['L0.visited_steps', 'L0.skipped_steps'];

/**
 * JSON text with object keys sorted at every level, so a stored copy (jsonb reorders keys) gives the same text. A key holding
 * null or undefined is left out: an empty answer reads back either way.
 */
export function stableText(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((v) => (v === undefined ? 'null' : stableText(v))).join(',')}]`;
  if (typeof value === 'object' && value !== null) {
    const rec = value as Record<string, unknown>;
    const parts = Object.keys(rec)
      .filter((k) => rec[k] !== undefined && rec[k] !== null)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableText(rec[k])}`);
    return `{${parts.join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

/** 32-bit FNV-1a over the UTF-16 code units, as 8 hex digits. */
function fnv1a(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/** The fingerprint of a check's inputs: equal for the same inputs in any key order, different after any edit. */
export function checkInputsKey(check: CheckV2): string {
  const stored = toStoredV2(check) as Record<string, unknown>;
  const answers = { ...(check.layerAnswers as Record<string, unknown>) };
  for (const k of BOOKKEEPING) delete answers[k];
  const text = stableText({ ...stored, layerAnswers: answers });
  return `${text.length.toString(36)}-${fnv1a(text)}`;
}
