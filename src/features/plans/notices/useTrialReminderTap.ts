// 09-19 / UAT C2-3: a tap on the trial reminder opens You > Subscription, whether the app was running (warm) or closed (cold).
// A cold-start tap only exists as the OS's "last notification response", so it is read once on mount, then cleared once routed.
// It acts only on kind 'trial_end', so it can never double-route with the Decide observer (useNotificationObserver), which acts
// only on 'wait' / 'cooling_off' and clears the stored response only after routing one of its own kinds.
// The route is fixed in-app; nothing from the payload is used to build it (T-2bs-03).
import { useEffect, useRef } from 'react';
import { router } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { SUBSCRIPTION_HREF } from '../routes';
import { isTrialReminderResponse } from './trialReminder';

export function useTrialReminderTap(enabled: boolean): void {
  const routed = useRef(new Set<string>());

  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;

    const route = (r: Notifications.NotificationResponse | null): void => {
      if (!r || !isTrialReminderResponse(r)) return;
      const requestId = r.notification.request.identifier;
      if (routed.current.has(requestId)) return;
      routed.current.add(requestId);
      router.push(SUBSCRIPTION_HREF);
      // `routed` is per mount; a remounted host would read the same last response and push Subscription again.
      void Notifications.clearLastNotificationResponseAsync().catch(() => undefined);
    };

    // A failed read (no native module, or a malformed stored response) must never break the signed-in layout.
    void Notifications.getLastNotificationResponseAsync()
      .then((r) => {
        if (!cancelled) route(r);
      })
      .catch(() => undefined);
    const sub = Notifications.addNotificationResponseReceivedListener(route);
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, [enabled]);
}
