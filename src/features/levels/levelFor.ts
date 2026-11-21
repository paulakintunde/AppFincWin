// Pure (no React or I/O). Port of the prototype levelFor/applyOnb (FincWin United.dc.html ~3618-3640); tax rule dropped (D-26); cut features removed (D-32).
import type { OnboardingAnswers } from './onboardingAnswers';
import { SKIP_LEVEL_FLOOR } from './onboardingAnswers';

/**
 * Answers to a level, 1 to 4. The prototype numbers levels 0 to 3; the app numbers them 1 to 4.
 * Skipping the goal gives Everyday (D-27). An explicit "Keep track" gives Basics.
 * Owing money, investments and lumpy income only ever raise the level.
 */
export function levelFor(a: OnboardingAnswers): 1 | 2 | 3 | 4 {
  let lv: number = SKIP_LEVEL_FLOOR;
  switch (a.goal) {
    case 'track':
      lv = 1;
      break;
    case 'stop':
    case 'save':
      lv = 2;
      break;
    case 'debt':
    case 'biz':
      lv = 3;
      break;
    default:
      break;
  }
  if (a.debt !== undefined && a.debt !== 'none') lv = Math.max(lv, 3);
  if (a.inv === 'some') lv = Math.max(lv, 3);
  if (a.inv === 'lots') lv = 4;
  if (a.shape === 'lumpy' || a.shape === 'mixed') lv = Math.max(lv, 3);
  return Math.min(4, Math.max(1, lv)) as 1 | 2 | 3 | 4;
}
