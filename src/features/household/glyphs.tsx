// 06.2 D-03: FincWin's own icon set only. The household names from the plan map onto icons that already exist, in one place.
// There is no link icon: the summary link is deferred (D-45).
import type { IconName } from '@/ui/icons/iconData';

export const householdIcons = {
  people: 'household',
  swap: 'transfer',
  settle: 'settlement',
  person: 'profile',
} as const satisfies Record<string, IconName>;

export type HouseholdIconKey = keyof typeof householdIcons;
