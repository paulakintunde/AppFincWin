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
import { textRole } from '@/theme/typography';
import { Text } from '@/ui/Text';
import { Pill } from './Pill';
import { DURATION, EASING, useMotion } from '@/theme/motion';
import { pushSheet, removeSheet, useIsTopSheet } from '@/state/sheetStack';
import { SheetOverlaySlot, useSheetOverlay } from './sheetOverlay';
import { hapticSelection } from './haptics';
import {
  BACKDROP_OPACITY,
  SHEET_DISMISS_DELAY,
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
  /** D-26: while true, drag, Android back and backdrop open 'Discard changes?' instead of closing. Cancel never asks (D-27): callers wire Cancel to their own close. */
  dirty?: boolean;
  /** D-26 / G2: called instead of onDismiss when the user picks Discard in "Discard changes?", so an owner can roll its edits back before closing. Defaults to onDismiss. */
  onDiscard?: () => void;
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

export function Sheet({ visible, onDismiss, children, accessibilityLabel, dismissible = true, dirty = false, onDiscard }: SheetProps) {
  const t = useT();
  const { colors } = useTheme();
  const insets = useScreenInsets();
  const { height } = useWindowDimensions();
  const keyboardHeight = useAndroidKeyboardHeight();
  const motion = useMotion();
  const id = useId();
  const Overlay = useSheetOverlay();
  const isTop = useIsTopSheet(id);

  const onDismissRef = useRef(onDismiss);
  const onDiscardRef = useRef(onDiscard);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dismissingRef = useRef(false);
  const dismissibleRef = useRef(dismissible);
  const dirtyRef = useRef(dirty);
  const [discardOpen, setDiscardOpen] = useState(false);
  const visibleRef = useRef(visible);
  const durationRef = useRef(motion.duration);
  useEffect(() => {
    onDismissRef.current = onDismiss;
    onDiscardRef.current = onDiscard;
    dismissibleRef.current = dismissible;
    dirtyRef.current = dirty;
    visibleRef.current = visible;
    durationRef.current = motion.duration;
  });

  const translateY = useSharedValue(height);
  const backdrop = useSharedValue(0);
  const sheetHeight = useSharedValue(height);
  const canDragDismiss = useSharedValue(dismissible && !dirty);
  const scrollY = useSharedValue(0);
  const bodyTop = useSharedValue(Number.POSITIVE_INFINITY); // sheets without a SheetScroll drag everywhere
  const inBody = useSharedValue(false);
  const startDy = useSharedValue(0);
  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const containerRef = useRef<View | null>(null);
  const scrollNative = useMemo(() => Gesture.Native(), []);

  useEffect(() => {
    canDragDismiss.value = dismissible && !dirty;
  }, [dismissible, dirty, canDragDismiss]);

  const clearDismissTimer = useCallback(() => {
    if (dismissTimerRef.current !== null) {
      clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = null;
    }
  }, []);

  // H5: the drag-dismiss timer never outlives the sheet; the flag resets on close.
  useEffect(() => () => clearDismissTimer(), [clearDismissTimer]);
  useEffect(() => {
    if (!visible) {
      clearDismissTimer();
      dismissingRef.current = false;
    }
  }, [visible, clearDismissTimer]);

  useEffect(() => {
    if (!visible) return;
    clearDismissTimer();
    dismissingRef.current = false;
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
    if (dismissingRef.current) return;
    if (!dismissibleRef.current) return;
    if (dirtyRef.current) {
      setDiscardOpen(true);
      return;
    }
    onDismissRef.current();
  }, []);

  const onDragDismiss = useCallback(() => {
    hapticSelection();
    dismissingRef.current = true;
    clearDismissTimer();
    dismissTimerRef.current = setTimeout(() => {
      dismissTimerRef.current = null;
      dismissingRef.current = false;
      requestDismiss('drag');
      // Pitfall 5: if the owner kept the sheet open, bring it back instead of leaving an invisible Modal.
      requestAnimationFrame(() => {
        if (!visibleRef.current) return;
        translateY.value = withTiming(0, { duration: DURATION.sheetDrag, easing: EASING });
        backdrop.value = withTiming(BACKDROP_OPACITY, { duration: DURATION.backdrop, easing: Easing.ease });
      });
    }, durationRef.current(SHEET_DISMISS_DELAY));
  }, [requestDismiss, clearDismissTimer, translateY, backdrop]);

  // A dirty sheet dragged past the threshold snaps back (canDragDismiss) and asks instead.
  const onBlockedDismiss = useCallback(() => {
    if (dirtyRef.current && dismissibleRef.current) setDiscardOpen(true);
  }, []);

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetY(10)
        .failOffsetX([-10, 10])
        .simultaneousWithExternalGesture(scrollNative)
        .withTestId('sheet-drag')
        .onBegin((e) => {
          // eslint-disable-next-line react-hooks/immutability -- Reanimated shared value mutated by design
          inBody.value = e.y >= bodyTop.value;
          // eslint-disable-next-line react-hooks/immutability -- Reanimated shared value mutated by design
          startDy.value = 0;
        })
        .onUpdate((e) => {
          if (inBody.value && scrollY.value > 0) {
            // eslint-disable-next-line react-hooks/immutability -- Reanimated shared value mutated by design
            startDy.value = e.translationY;
            return;
          }
          const dy = clampDrag(e.translationY - startDy.value);
          // eslint-disable-next-line react-hooks/immutability -- Reanimated shared value mutated by design
          translateY.value = dy;
          if (dy > 0 && inBody.value) scrollTo(scrollRef, 0, 0, false);
        })
        // eslint-disable-next-line react-hooks/refs -- ref handed to a Gesture/animated ref, not read during render
        .onEnd((e) => {
          // A pan that began in a scrolled body is a scroll, not a dismissal.
          const scrolling = inBody.value && scrollY.value > 0;
          const dy = scrolling ? 0 : clampDrag(e.translationY - startDy.value);
          if (sheetDragOutcome(dy, e.velocityY) === 'dismiss' && canDragDismiss.value) {
            // eslint-disable-next-line react-hooks/immutability -- Reanimated shared value mutated by design
            translateY.value = withTiming(sheetHeight.value * 1.1, { duration: DURATION.sheetDrag, easing: EASING });
            // eslint-disable-next-line react-hooks/immutability -- Reanimated shared value mutated by design
            backdrop.value = withTiming(0, { duration: SHEET_DISMISS_DELAY, easing: EASING });
            scheduleOnRN(onDragDismiss);
          } else {
            translateY.value = withTiming(0, { duration: DURATION.sheetDrag, easing: EASING });
            if (sheetDragOutcome(dy, e.velocityY) === 'dismiss') scheduleOnRN(onBlockedDismiss);
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

  // Drop a stale prompt when the owner closes the sheet or it stops being dirty (state adjusted during render, not in an effect).
  if ((!visible || !dirty) && discardOpen) setDiscardOpen(false);

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
              // eslint-disable-next-line react-hooks/immutability -- Reanimated shared value mutated by design
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
            {dirty ? (
              <DiscardPrompt
                visible={discardOpen}
                onKeep={() => setDiscardOpen(false)}
                onDiscard={() => {
                  setDiscardOpen(false);
                  (onDiscardRef.current ?? onDismissRef.current)();
                }}
              />
            ) : null}
          </Animated.View>
        </GestureDetector>
      </KeyboardAvoidingView>
      {Overlay !== null && isTop ? (
        <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
          <SheetOverlaySlot />
        </View>
      ) : null}
      </GestureHandlerRootView>
    </Modal>
  );
}

interface DiscardPromptProps {
  visible: boolean;
  onKeep: () => void;
  onDiscard: () => void;
}

/** D-26/D-28: rendered inside the edit sheet's container so it is a nested Modal over it. Its own dismissal is Keep editing. */
function DiscardPrompt({ visible, onKeep, onDiscard }: DiscardPromptProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  return (
    <Sheet visible={visible} onDismiss={onKeep} accessibilityLabel={t('sheet.discard.title')}>
      <View style={styles.promptColumn}>
        <Text style={{ ...textRole(pairing, 'sheetTitle'), color: colors.ink }}>{t('sheet.discard.title')}</Text>
        <Text style={{ ...textRole(pairing, 'body'), color: colors.ink }}>{t('sheet.discard.body')}</Text>
        <View style={styles.promptActions}>
          <Pill label={t('sheet.discard.keep')} variant="secondary" onPress={onKeep} />
          <Pill label={t('sheet.discard.confirm')} variant="danger" onPress={onDiscard} />
        </View>
      </View>
    </Sheet>
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
    // eslint-disable-next-line react-hooks/immutability -- Reanimated shared value mutated by design
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
  promptColumn: {
    gap: space.groupGap,
  },
  promptActions: {
    flexDirection: 'row',
    gap: space.gapMd,
  },
  container: {
    width: '100%',
    flexShrink: 1,
  },
});
