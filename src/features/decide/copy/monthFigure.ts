/**
 * 05-136 (D-106): the one place that words a signed month figure. A positive (or zero) figure reads "{{amount}} free", a
 * negative one "{{amount}} overspent", the amount absolute with no minus. Pure: no React, no t(). Every screen that shows a
 * month figure in words calls this, so the sign test exists once.
 */
import { ref } from './types';
import type { CopyRef, Fmt } from './types';

/** True when the month closes under water: a negative month figure. Zero is free. */
export function isOverspent(value: number): boolean {
  return value < 0;
}

export function monthFigure(value: number, fmt: Fmt): CopyRef {
  return isOverspent(value) ? ref('decide.fig.overspent', { amount: fmt(-value) }) : ref('decide.fig.free', { amount: fmt(value) });
}
