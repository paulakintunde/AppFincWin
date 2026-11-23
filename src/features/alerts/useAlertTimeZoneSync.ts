// 10-22 (D-11): the server compares quiet hours and the 8:00 am summary in the person's own zone, so the saved zone follows
// the device. Saves once when the two differ.
import { useEffect, useRef } from 'react';
import { useAlertPrefs } from '@/data/queries/alerts';
import { useSaveAlertPrefs } from '@/data/mutations/alertSettings';
import { getDeviceTimeZone } from '@/services/locale/deviceLocale';

export function useAlertTimeZoneSync(userId?: string): void {
  const prefs = useAlertPrefs(userId).data;
  const { saveAlertPrefs } = useSaveAlertPrefs();
  const sentFor = useRef<string | null>(null);
  useEffect(() => {
    if (!userId || !prefs) return;
    const zone = getDeviceTimeZone();
    if (zone === prefs.timeZone || sentFor.current === zone) return;
    sentFor.current = zone;
    saveAlertPrefs({ userId, patch: { timeZone: zone }, baseVersion: prefs.version });
  }, [userId, prefs, saveAlertPrefs]);
}
