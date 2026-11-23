// 10-21 (D-02): the four "Ask for it" choices, in order, with their copy keys.
import type { LockTiming } from '@/services/lock/pin';

export const TIMING_CHOICES: readonly { timing: LockTiming; key: string }[] = [
  { timing: 'now', key: 'system.appLock.timingImmediately' },
  { timing: 'oneMinute', key: 'system.appLock.timingOneMinute' },
  { timing: 'fiveMinutes', key: 'system.appLock.timingFiveMinutes' },
  { timing: 'fifteenMinutes', key: 'system.appLock.timingFifteenMinutes' },
];

/** mm:ss, tabular. */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
