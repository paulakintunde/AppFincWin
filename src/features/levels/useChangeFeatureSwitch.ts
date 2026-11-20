// 09-22: one place a feature switch changes (D-34, D-36, D-38). Used by a Features row and by "Turn on" on an offer.
// Writes at once (no Save button), taps the haptic, says "{Feature} is on/off" with an Undo that writes the previous value back,
// and sends the typed event (the analytics service itself drops it without consent).
import { useCallback } from 'react';
import { useSetFeatureSwitch } from '@/data/mutations/userSetup';
import { useAuth } from '@/features/auth/AuthProvider';
import { useT } from '@/i18n';
import { getAnalytics } from '@/services/analytics';
import { showToast } from '@/state/undoToast';
import { hapticTap } from '@/ui/haptics';
import type { FeatureId } from './featureRegistry';

type L = (key: string, params?: Record<string, string | number>) => string;

export function useChangeFeatureSwitch(): (featureId: FeatureId, next: boolean, previous: boolean) => void {
  const { user } = useAuth();
  const userId = user?.id;
  const t = useT();
  const { setFeatureSwitch } = useSetFeatureSwitch();
  return useCallback(
    (featureId, next, previous) => {
      if (userId === undefined) return;
      const name = (t as unknown as L)(`features.items.${featureId}.label`);
      hapticTap();
      setFeatureSwitch({ userId, featureId, isOn: next });
      getAnalytics().track('feature_switch_changed', { feature: featureId, on: next });
      showToast({
        kind: 'ordinary',
        text: { key: next ? 'features.toastOn' : 'features.toastOff', params: { feature: name } },
        onUndo: () => {
          setFeatureSwitch({ userId, featureId, isOn: previous });
          getAnalytics().track('feature_switch_changed', { feature: featureId, on: previous });
        },
      });
    },
    [userId, t, setFeatureSwitch]
  );
}
