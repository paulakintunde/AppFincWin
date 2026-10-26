// Compile-only (tsc, never run): a v1 CheckInputs is structurally a LegacyCheckInputsV1, so stored v1 checks reach the v3 adapters
// without a cast (I42). If CheckInputs drifts from the legacy mirror, `npm run typecheck` fails here.
import type { LegacyCheckInputsV1 } from '@/engine/decide/v3';
import type { CheckInputs } from '../../types';

export const _legacyShape = (x: CheckInputs): LegacyCheckInputsV1 => x;
