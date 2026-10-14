/**
 * UI-SPEC Design System: the shared modal bottom sheet container every Record sheet
 * (entry, category, account, import) is built on.
 * Phase 3 (D-12): stays an RN Modal with its own gesture root; drag-to-dismiss, the ink-at-38% backdrop,
 * stacking and dismissal rules are added here. One Sheet per call site; a sheet opened from a sheet renders
 * INSIDE the parent's children (sibling Modals are dropped on iOS, 02.3 Pattern 4).
 */
import React, { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, space, useScreenInsets } from '@/theme/layout';
import { DURATION, EASING } from '@/theme/motion';
import { BACKDROP_OPACITY } from './sheetDrag';

export interface SheetProps {
  visible: boolean;
  onDismiss: () => void;
  children: ReactNode;
  accessibilityLabel?: string;
  /** false: drag snaps back and back/backdrop are ignored (e.g. a save in flight). Default true. */
  dismissible?: boolean;
}

export type SheetDismissSource = 'backdrop' | 'drag' | 'back';

/**
 * Android: a transparent Modal is its own window that adjustResize does not shrink under
 * SDK 57 edge-to-edge, and KeyboardAvoidingView has no `behavior` there, so the keyboard
 * would cover the focused input. Track its height and pad the sheet by it; the capped
 * container then shrinks and the SheetScroll body scrolls the focused field into view.
 * iOS keeps KeyboardAvoidingView 'padding'.
 */
function useAndroidKeyboardHeight(): number {
  const [kb, setKb] = useState(0);
  useEffect(() => {
    if (Platform.OS !== 'android') return undefined;
    const show = Keyboard.addListener('keyboardDidShow', (e) => setKb(e.endCoordinates.height));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKb(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return kb;
}

export function Sheet({ visible, onDismiss, children, accessibilityLabel, dismissible = true }: SheetProps) {
  const t = useT();
  const { colors } = useTheme();
  const insets = useScreenInsets();
  const { height } = useWindowDimensions();
  const keyboardHeight = useAndroidKeyboardHeight();
  const onDismissRef = useRef(onDismiss);
  const dismissibleRef = useRef(dismissible);
  useEffect(() => {
    onDismissRef.current = onDismiss;
    dismissibleRef.current = dismissible;
  });
  const requestDismiss = (_source: SheetDismissSource) => {
    if (!dismissibleRef.current) return;
    onDismissRef.current();
  };
  // The Modal does not animate (animationType none); the backdrop fades and the sheet rises on open.
  const translateY = useSharedValue(height);
  const backdrop = useSharedValue(0);
  useEffect(() => {
    if (!visible) return;
    // Reset on every open: a drag leaves translateY at 110%.
    translateY.value = height;
    backdrop.value = 0;
    translateY.value = withTiming(0, { duration: DURATION.sheetUp, easing: EASING });
    backdrop.value = withTiming(BACKDROP_OPACITY, { duration: DURATION.backdrop, easing: Easing.ease });
    // Re-run on open only; a rotation while open should not replay the slide.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);
  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdrop.value }));
  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: translateY.value }] }));

  if (!visible) {
    return null;
  }

  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={() => requestDismiss('back')}>
      {/* A Modal is its own native window on Android, outside the root GestureHandlerRootView in
          app/_layout.tsx, so RNGH gestures (SwipeRow) need a root of their own in here. */}
      <GestureHandlerRootView testID="sheet-gesture-root" style={styles.flex}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Animated.View
          testID="sheet-backdrop-fill"
          pointerEvents="none"
          style={[styles.backdrop, { backgroundColor: colors.ink }, backdropStyle]}
        />
        <Pressable
          testID="sheet-backdrop"
          style={styles.backdrop}
          accessibilityRole="button"
          accessibilityLabel={t('a11y.close')}
          onPress={() => requestDismiss('backdrop')}
        />
        <Animated.View
          testID="sheet-container"
          accessibilityLabel={accessibilityLabel}
          style={[
            styles.container,
            sheetStyle,
            {
              // S-CR-05: never taller than the screen below the status bar, so the header
              // (title and Cancel) is always reachable; the body scrolls in a SheetScroll.
              maxHeight: height - insets.top - space.groupGap,
              backgroundColor: colors.surface,
              borderTopLeftRadius: radii.sheetTop,
              borderTopRightRadius: radii.sheetTop,
              paddingHorizontal: space.sheetCornerPad,
              paddingTop: space.sheetCornerPad,
              paddingBottom: space.sheetPadBottom + insets.bottom + keyboardHeight,
            },
          ]}
        >
          {children}
        </Animated.View>
      </KeyboardAvoidingView>
      </GestureHandlerRootView>
    </Modal>
  );
}

export interface SheetScrollProps {
  children: ReactNode;
  contentContainerStyle?: StyleProp<ViewStyle>;
}

/**
 * S-CR-05: the scrollable body of a sheet. Placed after the SheetHeader, it shrinks to the
 * space the capped container leaves, so a long list scrolls while the header stays put.
 */
export function SheetScroll({ children, contentContainerStyle }: SheetScrollProps) {
  return (
    <ScrollView
      testID="sheet-scroll"
      style={styles.scroll}
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets
      contentContainerStyle={contentContainerStyle}
    >
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flexShrink: 1,
  },
  flex: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
  },
  container: {
    width: '100%',
    flexShrink: 1,
  },
});
