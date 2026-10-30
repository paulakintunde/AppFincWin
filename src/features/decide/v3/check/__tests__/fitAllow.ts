// 05.3-24: text-fit allowlist for the Check screen core. Paths are relative to src/features/decide.
import type { FitAllow } from '../../shared/fitAllowTypes';

export const FIT_ALLOW: FitAllow = {
  number: [
    { path: 'v3/check/ItemTypeChips.tsx', kind: 'forwarded', count: 1, reason: 'Chip prop for a user-typed custom item type; Chip applies the tail ellipsis (rule T)' },
  ],
  geometry: [],
  overlay: [],
};
