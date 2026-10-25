// 05-11 (D-10): a reminder tap reopens the check at step 3 (recomputed there).
// The href is built in-app; nothing in the payload except a validated uuid is trusted.
import { useEffect, useRef } from 'react';
import { useRouter, type Href } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { isUuid } from '@/features/navigation/routeParams';

export function checkIdFromResponse(r: Notifications.NotificationResponse | null): string | null {
  if (!r || r.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return null;
  const data = r.notification.request.content.data as Record<string, unknown> | undefined;
  const checkId = data?.checkId;
  const kind = data?.kind;
  if (kind !== 'wait' && kind !== 'cooling_off') return null;
  return isUuid(checkId) ? checkId : null;
}

export function useNotificationObserver(enabled: boolean): void {
  const router = useRouter();
  const routed = useRef(new Set<string>());

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    const route = (r: Notifications.NotificationResponse | null) => {
      const id = checkIdFromResponse(r);
      if (!id || !r) return;
      const requestId = r.notification.request.identifier;
      if (routed.current.has(requestId)) return;
      routed.current.add(requestId);
      router.push({ pathname: '/decide/check/[id]', params: { id, step: '3' } } as Href);
      // IN-B02: `routed` is per mount; a remounted host would read the same last response and push the check again.
      void Notifications.clearLastNotificationResponseAsync().catch(() => undefined);
    };

    void Notifications.getLastNotificationResponseAsync().then((r) => {
      if (!cancelled) route(r);
    });
    const sub = Notifications.addNotificationResponseReceivedListener(route);
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, [enabled, router]);
}
