// D-20 / NAV-06: move screen-reader focus to a screen's title after a tab change or push, only when
// a screen reader is on. RN 0.86's sendAccessibilityEvent(host, 'focus') takes the host instance
// directly (no findNodeHandle; 03-RESEARCH Pitfall 6). OS focus movement is verified by hand in 03-14.
import { useCallback } from 'react';
import { AccessibilityInfo, type HostInstance } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { DURATION } from '@/theme/motion';

export function focusAccessibility(target: HostInstance | null | undefined): void {
  if (!target) return;
  AccessibilityInfo.sendAccessibilityEvent(target, 'focus');
}

export function useScreenTitleFocus(ref: React.RefObject<HostInstance | null>): void {
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      const timer = setTimeout(() => {
        void AccessibilityInfo.isScreenReaderEnabled().then((on) => {
          if (on && !cancelled) focusAccessibility(ref.current);
        });
      }, DURATION.push);
      return () => {
        cancelled = true;
        clearTimeout(timer);
      };
    }, [ref]),
  );
}
