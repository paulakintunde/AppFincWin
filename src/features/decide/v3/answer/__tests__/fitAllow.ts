// 05.3-25: text-fit allowlist for the answer hero, confidence chip and sheet, and notice tiles. Paths are relative to
// src/features/decide. None of these files uses numberOfLines, a fixed text height or absolute text, so nothing is listed.
import type { FitAllow } from '../../shared/fitAllowTypes';

export const FIT_ALLOW: FitAllow = {
  number: [],
  geometry: [],
  overlay: [],
};
