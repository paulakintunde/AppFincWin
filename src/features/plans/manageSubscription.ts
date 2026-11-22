/**
 * 09-25 (A5-2): every "Manage subscription" tap goes through here, so it is never a dead tap. It opens the store's
 * subscriptions page (the platform page when the plan is not billed by a store); when no page opened, a toast says so.
 * The app never claims to cancel anything itself (D-23).
 */
import { captureError } from '@/services/errors';
import { showToast } from '@/state/undoToast';
import { openManageSubscription } from './store/purchasesClient';

export async function manageSubscription(store: string | null | undefined): Promise<void> {
  let opened = false;
  try {
    opened = await openManageSubscription({ store: store ?? null });
  } catch (e) {
    captureError(e, { area: 'unknown' });
  }
  if (!opened) showToast({ kind: 'info', text: { key: 'plans.subscription.manageFailed' } });
}
