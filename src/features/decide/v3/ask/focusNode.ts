// 05.3-32 (D-08): move screen-reader focus to a node. A nicety: a missing handle or a thrown error is ignored.
import { AccessibilityInfo, findNodeHandle } from 'react-native';

export function focusNode(node: unknown): void {
  if (node === null || node === undefined) return;
  const handle = findNodeHandle(node as Parameters<typeof findNodeHandle>[0]);
  if (!handle) return;
  try {
    AccessibilityInfo.setAccessibilityFocus(handle);
  } catch {
    // Focus is a nicety; ignore failures.
  }
}
