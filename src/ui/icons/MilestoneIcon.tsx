/**
 * 06.2-08 (D-04, D-15, D-19, D-25): the play-once animated icon for a real milestone.
 *
 * Each Lottie file is generated from the same board drawing as its still icon (scripts/icons/build-lottie.mjs, from
 * icons.generated.json), so the last frame is the still Glyph. It plays once for 1.2 s through AnimatedIcon, which shows
 * the still Glyph on a build without the Lottie native view, under Reduce Motion, or while another icon plays.
 * The files carry no colour: the theme colour is set at runtime on the 'back' and 'front' layers (colorFilters). The
 * back layer's 45% opacity lives in the file, so both layers take the same colour, as the still Glyph does.
 *
 * D-19 / Claude's discretion: only milestones whose feature exists on main ship here. Nothing for spending, a "fits"
 * answer, streaks, deleting an account, household joined (Phase 8), welcome (Phase 9) or export ready (Phase 10).
 */
import React from 'react';
import { AnimatedIcon } from './AnimatedIcon';
import type { IconName } from './iconData';
import goalReached from '../../../assets/lottie/goalReached.json';
import debtCleared from '../../../assets/lottie/debtCleared.json';
import importDone from '../../../assets/lottie/importDone.json';
import firstEntry from '../../../assets/lottie/firstEntry.json';
import safetyNetLocked from '../../../assets/lottie/safetyNetLocked.json';

const MILESTONES = {
  goalReached: { source: goalReached, still: 'stateFits' },
  debtCleared: { source: debtCleared, still: 'stateFits' },
  importDone: { source: importDone, still: 'import' },
  firstEntry: { source: firstEntry, still: 'firstEntry' },
  safetyNetLocked: { source: safetyNetLocked, still: 'stateSafetyNet' },
} as const satisfies Record<string, { source: object; still: IconName }>;

export type MilestoneName = keyof typeof MILESTONES;

/** The milestone names, in a fixed order (tests and pickers). */
export const MILESTONE_NAMES = Object.keys(MILESTONES) as MilestoneName[];

export interface MilestoneIconProps {
  name: MilestoneName;
  /** The theme colour (a token value). Applied to both layers at runtime. */
  color: string;
  size?: 24 | 48;
  testID?: string;
}

export function MilestoneIcon({ name, color, size = 48, testID }: MilestoneIconProps) {
  const { source, still } = MILESTONES[name];
  return (
    <AnimatedIcon
      source={source}
      still={still}
      color={color}
      size={size}
      colorFilters={[
        { keypath: 'back', color },
        { keypath: 'front', color },
      ]}
      testID={testID}
    />
  );
}
