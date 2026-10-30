// D-13 (05.3): the records as if no refund were linked. Pure; never mutates its input.
import type { V3Inputs, V3Line, V3Month } from '@/engine/decide/v3';

const linked = (l: V3Line): boolean => l.refundOf !== undefined && l.refundOf !== null;

function stripLine(l: V3Line): V3Line {
  const { refundOf: _link, ...rest } = l;
  return rest;
}

function stripMonth(m: V3Month): V3Month {
  return m.lines.some(linked) ? { ...m, lines: m.lines.map((l) => (linked(l) ? stripLine(l) : l)) } : m;
}

/** Every line's refund link cleared; a refund then counts in the month it was logged, as before linking existed. */
export function stripRefunds(inputs: V3Inputs): V3Inputs {
  return { ...inputs, months: inputs.months.map(stripMonth) };
}

/** D-13: true when any month line carries a refund link, so the comparison run is worth doing. */
export function hasRefundLinks(inputs: V3Inputs): boolean {
  return inputs.months.some((m) => m.lines.some(linked));
}
