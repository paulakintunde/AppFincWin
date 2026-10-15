// NAV-01 / D-05: the shell, not the navigator, decides each tab slide. Forward follows D-01 order;
// a back step (marked by the TabBar's back-step switcher) is always reverse. Module state, no React import; wiped on sign-out.
import { slideFor, type SlideDirection } from './direction';
import type { TabId } from './tabs';
import { registerWipeHandler } from '@/services/storage/wipe';

let last: TabId | null = null;
let backPending = false;

export function markBackStep(): void {
  backPending = true;
}

export function clearBackStep(): void {
  backPending = false;
}

export function takeSlideFor(tab: TabId): SlideDirection {
  const dir: SlideDirection = last === null ? 'none' : slideFor(last, tab, backPending);
  last = tab;
  backPending = false;
  return dir;
}

export function resetTabSlideForTests(): void {
  last = null;
  backPending = false;
}

registerWipeHandler({
  id: 'tab-slide',
  wipe: async () => {
    last = null;
    backPending = false;
  },
});
