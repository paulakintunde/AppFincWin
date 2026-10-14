// D-16 + DSG-03: FAB and app-layer toast positions derive from the measured tab bar and safe area,
// never the prototype's fixed pixel guesses; the in-sheet toast position is Sheet's own (03-19).
import { space, useScreenInsets } from '@/theme/layout';
import { useBackHistory } from '@/shell/backHistory/BackHistoryProvider';
import { useShellLayout } from '@/shell/layout/ShellLayoutProvider';

export function useFabOffsets(): { bottom: number; lift: number } {
  const { tabBarHeight, toastHeight } = useShellLayout();
  return {
    bottom: tabBarHeight + space.fabInset,
    lift: toastHeight > 0 ? toastHeight + space.gapSm : 0,
  };
}

export function useToastSlot(): { bottom: number; reportHeight(h: number | null): void } {
  const { tabBarHeight, reportToastHeight } = useShellLayout();
  const { current } = useBackHistory();
  const insets = useScreenInsets();
  const bottom =
    current?.area === 'tab' ? tabBarHeight + space.gapMd : insets.bottom + space.sheetPadBottom;
  return { bottom, reportHeight: reportToastHeight };
}
