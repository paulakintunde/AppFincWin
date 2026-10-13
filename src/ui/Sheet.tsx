/**
 * UI-SPEC Design System: the shared modal bottom sheet container every Record sheet
 * (entry, category, account, import) is built on. Phase 3 (NAV-03) swaps internals for
 * @gorhom/bottom-sheet with drag-to-dismiss; props stay the same.
 */
import React, { useEffect, useState, type ReactNode } from 'react';
import {
  Animated,
  Easing,
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
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, space, useScreenInsets } from '@/theme/layout';

export interface SheetProps {
  visible: boolean;
  onDismiss: () => void;
  children: ReactNode;
  accessibilityLabel?: string;
}

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

export function Sheet({ visible, onDismiss, children, accessibilityLabel }: SheetProps) {
  const t = useT();
  const { colors } = useTheme();
  const insets = useScreenInsets();
  const { height } = useWindowDimensions();
  const keyboardHeight = useAndroidKeyboardHeight();
  // The Modal does not animate (animationType none) so the scrim stays put and appears with it;
  // only the sheet container slides up from below.
  const [slide] = useState(() => new Animated.Value(height));
  useEffect(() => {
    if (!visible) return;
    slide.setValue(height);
    Animated.timing(slide, { toValue: 0, duration: 250, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    // Re-run on open only; a rotation while open should not replay the slide.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  if (!visible) {
    return null;
  }

  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={onDismiss}>
      {/* A Modal is its own native window on Android, outside the root GestureHandlerRootView in
          app/_layout.tsx, so RNGH gestures (SwipeRow) need a root of their own in here. */}
      <GestureHandlerRootView testID="sheet-gesture-root" style={styles.flex}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable
          testID="sheet-backdrop"
          style={[styles.backdrop, { backgroundColor: colors.scrim }]}
          accessibilityRole="button"
          accessibilityLabel={t('a11y.close')}
          onPress={onDismiss}
        />
        <Animated.View
          testID="sheet-container"
          accessibilityLabel={accessibilityLabel}
          style={[
            styles.container,
            {
              transform: [{ translateY: slide }],
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
