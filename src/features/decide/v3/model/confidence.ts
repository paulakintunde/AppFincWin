/**
 * 05.3-18 (UI-SPEC Hero, confidence). PURE. A second chip shows unless the level is firm. When the figures were typed in
 * (rough_figures) it reads "Rough, from your figures" (D-57). The sheet lists one key per reason.
 */
import type { Confidence } from '@/engine/decide/v3';

export interface ConfidenceChipModel {
  readonly show: boolean;
  readonly labelKey: string;
  readonly tone: 'warn' | 'neutral';
  readonly reasonKeys: readonly string[];
}

export function confidenceChip(c: Confidence): ConfidenceChipModel {
  const reasonKeys = c.reasons.map((r) => `decide.v3.ui.confidence.reason.${r}`);
  if (c.reasons.includes('rough_figures')) {
    return { show: c.level !== 'firm', labelKey: 'decide.v3.ui.answer.rough', tone: 'warn', reasonKeys };
  }
  return { show: c.level !== 'firm', labelKey: `decide.v3.ui.confidence.level.${c.level}`, tone: c.level === 'rough' ? 'warn' : 'neutral', reasonKeys };
}
