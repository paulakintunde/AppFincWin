/* eslint-disable react-hooks/immutability, react-hooks/refs -- Reanimated shared values are mutated by design (gesture worklets, scroll handler, ref passed to a Gesture); the React-compiler purity rules do not model them. */
/**
 * UI-SPEC Design System: the shared modal bottom sheet container every Record sheet
 * (entry, category, account, import) is built on.
 * Phase 3 (D-12): stays an RN Modal with its own gesture root; drag-to-dismiss, the ink-at-38% backdrop,
 * stacking and dismissal rules are added here. One Sheet per call site; a sheet opened from a sheet renders
 * INSIDE the parent's children (sibling Modals are dropped on iOS, 02.3 Pattern 4). Open sheets register
 * in the sheetStack store (D-28/D-29); Android back, the backdrop and a drag only ever close the top one
 * because each Modal handles its own request.
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  AccessibilityInfo,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, {
  Easing,
  scrollTo,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type AnimatedRef,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
  type NativeGesture,
} from 'react-native-gesture-handler';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, size, space, useScreenInsets } from '@/theme/layout';
import { DURATION, EASING, useMotion } from '@/theme/motion';
import { pushSheet, removeSheet } from '@/state/sheetStack';
import { hapticSelection } from './haptics';
import {
  BACKDROP_OPACITY,
  SHEET_DISMISS_DELAY,
  SHEET_DISMISS_DISTANCE,
  clampDrag,
  sheetDragOutcome,
} from './sheetDrag';

export interface SheetProps {
  visible: boolean;
  onDismiss: () => void;
  children: ReactNode;
  accessibilityLabel?: string;
  /** false: drag snaps back and back/backdrop are ignored (e.g. a save in flight). Default true. */
  dismissible?: boolean;
}

export type SheetDismissSource = 'backdrop' | 'drag' | 'back';

interface SheetGesture {
  scrollY: SharedValue<number>;
  bodyTop: SharedValue<number>;
  scrollRef: AnimatedRef<Animated.ScrollView>;
  native: NativeGesture;
  containerRef: React.RefObject<View | null>;
}
const SheetGestureContext = createContext<SheetGesture | null>(null);

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
  const motion = useMotion();
  const id = useId();

  const onDismissRef = useRef(onDismiss);
  const dismissibleRef = useRef(dismissible);
  const visibleRef = useRef(visible);
  const durationRef = useRef(motion.duration);
  useEffect(() => {
    onDismissRef.current = onDismiss;
    dismissibleRef.current = dismissible;
    visibleRef.current = visible;
    durationRef.current = motion.duration;
  });

  const translateY = useSharedValue(height);
  const backdrop = useSharedValue(0);
  const sheetHeight = useSharedValue(height);
  const canDragDismiss = useSharedValue(dismissible);
  const scrollY = useSharedValue(0);
  const bodyTop = useSharedValue(Number.POSITIVE_INFINITY); // sheets without a SheetScroll drag everywhere
  const inBody = useSharedValue(false);
  const startDy = useSharedValue(0);
  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const containerRef = useRef<View | null>(null);
  const scrollNative = useMemo(() => Gesture.Native(), []);

  useEffect(() => {
    canDragDismiss.value = dismissible;
  }, [dismissible, canDragDismiss]);

  useEffect(() => {
    if (!visible) return;
    // Reset on every open: a drag leaves translateY at 110%.
    translateY.value = height;
    backdrop.value = 0;
    scrollY.value = 0;
    translateY.value = withTiming(0, { duration: DURATION.sheetUp, easing: EASING });
    backdrop.value = withTiming(BACKDROP_OPACITY, { duration: DURATION.backdrop, easing: Easing.ease });
    if (accessibilityLabel) AccessibilityInfo.announceForAccessibility(accessibilityLabel);
    // Re-run on open only; a rotation while open should not replay the slide.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // D-28: register while open so the FAB hides and only the top sheet hosts the toast.
  useEffect(() => {
    if (!visible) return undefined;
    pushSheet(id);
    return () => removeSheet(id);
  }, [visible, id]);

  const requestDismiss = useCallback((_source: SheetDismissSource) => {
    if (!dismissibleRef.current) return;
    onDismissRef.current();
  }, []);

  const onDragDismiss = useCallback(() => {
    hapticSelection();
    setTimeout(() => {
      requestDismiss('drag');
      // Pitfall 5: if the owner kept the sheet open, bring it back instead of leaving an invisible Modal.
      requestAnimationFrame(() => {
        if (!visibleRef.current) return;
        translateY.value = withTiming(0, { duration: DURATION.sheetDrag, easing: EASING });
        backdrop.value = withTiming(BACKDROP_OPACITY, { duration: DURATION.backdrop, easing: Easing.ease });
      });
    }, durationRef.current(SHEET_DISMISS_DELAY));
  }, [requestDismiss, translateY, backdrop]);

  // Hook point: 03-16 shows the Discard prompt here when a dirty sheet is dragged past the threshold.
  const onBlockedDismiss = useCallback(() => undefined, []);

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetY(10)
        .failOffsetX([-10, 10])
        .simultaneousWithExternalGesture(scrollNative)
        .withTestId('sheet-drag')
        .onBegin((e) => {
          inBody.value = e.y >= bodyTop.value;
          startDy.value = 0;
        })
        .onUpdate((e) => {
          if (inBody.value && scrollY.value > 0) {
            startDy.value = e.translationY;
            return;
          }
          const dy = clampDrag(e.translationY - startDy.value);
          translateY.value = dy;
          if (dy > 0 && inBody.value) scrollTo(scrollRef, 0, 0, false);
        })
        .onEnd((e) => {
          // A pan that began in a scrolled body is a scroll, not a dismissal.
          const scrolling = inBody.value && scrollY.value > 0;
          const dy = scrolling ? 0 : clampDrag(e.translationY - startDy.value);
          if (sheetDragOutcome(dy, e.velocityY) === 'dismiss' && canDragDismiss.value) {
            translateY.value = withTiming(sheetHeight.value * 1.1, { duration: DURATION.sheetDrag, easing: EASING });
            backdrop.value = withTiming(0, { duration: SHEET_DISMISS_DELAY, easing: EASING });
            scheduleOnRN(onDragDismiss);
          } else {
            translateY.value = withTiming(0, { duration: DURATION.sheetDrag, easing: EASING });
            if (dy > SHEET_DISMISS_DISTANCE) scheduleOnRN(onBlockedDismiss);
          }
        }),
    [
      scrollNative,
      inBody,
      bodyTop,
      startDy,
      scrollY,
      translateY,
      scrollRef,
      canDragDismiss,
      sheetHeight,
      backdrop,
      onDragDismiss,
      onBlockedDismiss,
    ],
  );

  const gestureCtx = useMemo<SheetGesture>(
    () => ({ scrollY, bodyTop, scrollRef, native: scrollNative, containerRef }),
    [scrollY, bodyTop, scrollRef, scrollNative],
  );

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
        <GestureDetector gesture={pan}>
          <Animated.View
            ref={containerRef}
            testID="sheet-container"
            collapsable={false}
            accessibilityLabel={accessibilityLabel}
            accessibilityViewIsModal
            onAccessibilityEscape={() => requestDismiss('back')}
            accessibilityActions={[{ name: 'escape', label: t('a11y.close') }]}
            onAccessibilityAction={(e) => {
              if (e.nativeEvent.actionName === 'escape') requestDismiss('back');
            }}
            onLayout={(e: LayoutChangeEvent) => {
              sheetHeight.value = e.nativeEvent.layout.height;
            }}
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
            {/* Grab handle: a 44px hit area pulled up into the corner padding and back down, so the
                header stays exactly where it was (prototype L2124: padding 9/10, margin -9/8). */}
            <View
              testID="sheet-handle"
              accessible={false}
              importantForAccessibility="no-hide-descendants"
              style={{
                height: size.sheetHandleHit,
                marginTop: -space.sheetCornerPad,
                marginBottom: -space.sheetCornerPad,
                paddingTop: 9,
                alignItems: 'center',
              }}
            >
              <View
                style={{
                  width: size.sheetHandleW,
                  height: size.sheetHandleH,
                  borderRadius: radii.pill,
                  backgroundColor: colors.line2,
                }}
              />
            </View>
            <SheetGestureContext.Provider value={gestureCtx}>{children}</SheetGestureContext.Provider>
          </Animated.View>
        </GestureDetector>
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
 * Inside a Sheet it reports its scroll offset so a downward drag only moves the sheet once the
 * body is at the top (D-12a); bounces are off so the pull never competes with the drag.
 */
export function SheetScroll({ children, contentContainerStyle }: SheetScrollProps) {
  const ctx = useContext(SheetGestureContext);
  const noop = useSharedValue(0);
  const fallbackRef = useAnimatedRef<Animated.ScrollView>();
  const scrollY = ctx?.scrollY ?? noop;
  const onScroll = useAnimatedScrollHandler((e) => {
    scrollY.value = e.contentOffset.y;
  });

  const onLayout = (e: LayoutChangeEvent) => {
    if (!ctx) return;
    // Immediate estimate from the layout (exact when the body is a direct child of the container) ...
    ctx.bodyTop.value = e.nativeEvent.layout.y;
    // ... refined by measuring against the container itself (research Pitfall 8).
    const node = ctx.scrollRef.current as unknown as {
      measureLayout?: (rel: unknown, ok: (x: number, y: number) => void, fail: () => void) => void;
    } | null;
    const container = ctx.containerRef.current;
    if (node && typeof node.measureLayout === 'function' && container) {
      try {
        node.measureLayout(
          container,
          (_x, y) => {
            ctx.bodyTop.value = y;
          },
          () => undefined,
        );
      } catch {
        // keep the estimate
      }
    }
  };

  const scroll = (
    <Animated.ScrollView
      ref={ctx?.scrollRef ?? fallbackRef}
      testID="sheet-scroll"
      style={styles.scroll}
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets
      contentContainerStyle={contentContainerStyle}
      onScroll={ctx ? onScroll : undefined}
      scrollEventThrottle={16}
      bounces={false}
      overScrollMode="never"
      onLayout={onLayout}
    >
      {children}
    </Animated.ScrollView>
  );
  if (!ctx) return scroll;
  return <GestureDetector gesture={ctx.native}>{scroll}</GestureDetector>;
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
