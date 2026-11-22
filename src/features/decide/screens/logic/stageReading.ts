/**
 * 08.1-20 (DCU-10): the stage of the answer on screen, read from the evaluation's basis and month model by the engine's
 * `stageOf`. Pure: no React, no I/O. One count everywhere: monthsUsed equals recordMonthsOf(...).used (06.1-79).
 */
import { stageOf, type Basis, type MonthModel, type StageReading } from '@/engine/decide/v3';

export interface StageReadingSource {
  readonly result: { readonly confidence?: { readonly basis: Basis } };
  readonly month?: Pick<MonthModel, 'monthsUsed' | 'incomePicture'>;
}

export function stageReadingOf(evaluation: StageReadingSource | null): StageReading | null {
  const basis = evaluation?.result.confidence?.basis;
  if (evaluation === null || basis === undefined) return null;
  return stageOf({ basis, month: evaluation.month ?? null });
}
