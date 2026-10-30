// 05.3-40: text-fit allowlist for the Check screen layer cards. Paths are relative to src/features/decide.
// No entries: the cards use no line clamps, fixed heights or absolute positions, and pass every user name through Chip/Text wrapping.
import type { FitAllow } from '../../shared/fitAllowTypes';

export const FIT_ALLOW: FitAllow = {
  number: [],
  geometry: [],
  overlay: [],
};
