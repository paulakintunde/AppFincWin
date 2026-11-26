// 10.1-21 (RCP-03, D-07; UI-SPEC section 3a): the full-screen receipt viewer. A canvas page with a header (close, "2 of 3", Remove),
// pictures that zoom by pinch and double tap, Previous / Next buttons beside the swipe, PDFs handed to the system viewer, and a calm
// "This file did not open." card with Try again. Links are made when a file is shown, kept in this component's state only (never in
// React Query) and last 60 seconds, so nothing secret reaches a cache. Reduce Motion: zoom changes at once.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Image, Modal, Pressable, StyleSheet, View } from 'react-native';
import { Directions, Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@/ui/Text';
import { Pill } from '@/ui/Pill';
import { Row } from '@/ui/Row';
import { ConfirmSheet } from '@/ui/ConfirmSheet';
import { Glyph } from '@/ui/icons/Glyph';
import { IconTile } from '@/ui/icons/IconTile';
import { LINK_HIT_SLOP } from '@/ui/pressFeedback';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { useReduceMotion } from '@/theme/motion';
import { radii, space, step } from '@/theme/layout';
import { textRole } from '@/theme/typography';
import { openPdf, signedUrlFor } from '@/services/receipts/openReceipt';
import type { ReceiptGroup } from './receiptGroups';

export interface ReceiptViewerProps {
  visible: boolean;
  groups: readonly ReceiptGroup[];
  /** The group to open at (its first page). */
  startGroupId?: string;
  onClose(): void;
  /** Removes the whole receipt (all pages of the group). */
  onRemove(groupId: string): void;
}

interface FileItem {
  group: ReceiptGroup;
  page: ReceiptGroup['pages'][number];
}

const MAX_ZOOM = 4;

function ZoomableImage({ uri, label, onError }: { uri: string; label: string; onError(): void }) {
  const reduce = useReduceMotion();
  const scale = useSharedValue(1);
  const saved = useSharedValue(1);
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const sx = useSharedValue(0);
  const sy = useSharedValue(0);
  const set = (sv: { value: number }, to: number) => {
    'worklet';
    sv.value = reduce ? to : withTiming(to, { duration: 150 });
  };
  const pinch = Gesture.Pinch()
    .onUpdate((e) => {
      scale.value = Math.min(MAX_ZOOM, Math.max(1, saved.value * e.scale));
    })
    .onEnd(() => {
      saved.value = scale.value;
      if (scale.value <= 1) {
        x.value = 0;
        y.value = 0;
      }
    });
  const pan = Gesture.Pan()
    .onStart(() => {
      sx.value = x.value;
      sy.value = y.value;
    })
    .onUpdate((e) => {
      if (scale.value <= 1) return;
      x.value = sx.value + e.translationX;
      y.value = sy.value + e.translationY;
    });
  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      const zoomed = scale.value > 1;
      set(scale, zoomed ? 1 : 2.5);
      saved.value = zoomed ? 1 : 2.5;
      if (zoomed) {
        set(x, 0);
        set(y, 0);
      }
    });
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }, { translateY: y.value }, { scale: scale.value }] }));
  return (
    <GestureDetector gesture={Gesture.Simultaneous(pinch, pan, doubleTap)}>
      <Animated.View style={[styles.imageBox, style]}>
        <Image
          source={{ uri }}
          resizeMode="contain"
          style={styles.image}
          accessibilityRole="image"
          accessible
          testID="receipt-viewer-image"
          accessibilityLabel={label}
          accessibilityIgnoresInvertColors
          onError={onError}
        />
      </Animated.View>
    </GestureDetector>
  );
}

export function ReceiptViewer({ visible, groups, startGroupId, onClose, onRemove }: ReceiptViewerProps) {
  if (!visible) return null;
  return <ViewerBody groups={groups} startGroupId={startGroupId} onClose={onClose} onRemove={onRemove} />;
}

function ViewerBody({ groups, startGroupId, onClose, onRemove }: Omit<ReceiptViewerProps, 'visible'>) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const insets = useSafeAreaInsets();
  const items = useMemo<FileItem[]>(() => groups.flatMap((group) => group.pages.map((page) => ({ group, page }))), [groups]);
  const [index, setIndex] = useState(() => {
    const at = items.findIndex((i) => i.group.groupId === startGroupId);
    return at < 0 ? 0 : at;
  });
  const [signed, setSigned] = useState<{ key: string; url: string | null } | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [confirming, setConfirming] = useState(false);

  const count = items.length;
  const at = Math.min(index, Math.max(0, count - 1));
  const current: FileItem | undefined = items[at];
  const isImage = current !== undefined && current.page.mime.startsWith('image/');
  const objectPath = current?.page.objectPath ?? null;
  const localUri = current?.page.localUri ?? null;
  // Which file (and which try) the state below belongs to, so moving on or pressing Try again starts clean.
  const fileKey = `${objectPath ?? localUri ?? ''}|${attempt}`;
  const mine = signed !== null && signed.key === fileKey ? signed : null;
  const url = localUri ?? mine?.url ?? null;
  const failed = errorKey === fileKey || (mine !== null && mine.url === null);

  // A fresh link whenever a stored picture is shown (or Try again is pressed); local files need none.
  useEffect(() => {
    if (!isImage || localUri !== null || objectPath === null) return;
    let alive = true;
    void signedUrlFor(objectPath).then((u) => {
      if (alive) setSigned({ key: fileKey, url: u });
    });
    return () => {
      alive = false;
    };
  }, [isImage, localUri, objectPath, fileKey]);

  const go = useCallback(
    (delta: number) => setIndex((i) => Math.min(count - 1, Math.max(0, Math.min(i, count - 1) + delta))),
    [count]
  );
  const fling = useMemo(
    () => [
      Gesture.Fling().direction(Directions.LEFT).runOnJS(true).onEnd(() => go(1)),
      Gesture.Fling().direction(Directions.RIGHT).runOnJS(true).onEnd(() => go(-1)),
    ],
    [go]
  );

  const openFile = async () => {
    if (objectPath === null) return;
    const res = await openPdf(objectPath);
    if (res === 'failed') setErrorKey(fileKey);
  };

  if (current === undefined) {
    // The last file was removed.
    return null;
  }

  const kindWord = current.page.mime === 'application/pdf' ? t('receipt.kind.pdf') : t(`receipt.kind.${current.group.kind}`);

  return (
    <Modal visible animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <GestureHandlerRootView style={[styles.page, { backgroundColor: colors.canvas, paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <View style={styles.header}>
          <Pressable accessibilityRole="button" accessibilityLabel={t('receipt.viewer.close')} onPress={onClose} style={styles.hit} hitSlop={LINK_HIT_SLOP}>
            <Glyph name="close" size={20} color={colors.ink} />
          </Pressable>
          <Text accessibilityLiveRegion="polite" style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>
            {t('receipt.viewer.counter', { n: at + 1, count })}
          </Text>
          <Pressable accessibilityRole="button" accessibilityLabel={t('receipt.viewer.remove')} onPress={() => setConfirming(true)} style={styles.hit} hitSlop={LINK_HIT_SLOP}>
            <Text style={{ ...textRole(pairing, 'bodyStrong'), color: colors.danger }}>{t('receipt.viewer.remove')}</Text>
          </Pressable>
        </View>

        <GestureDetector gesture={Gesture.Exclusive(fling[0]!, fling[1]!)}>
          <View style={styles.body} testID="receipt-viewer-body">
            {failed ? (
              <View style={[styles.card, { backgroundColor: colors.fill1 }]} testID="receipt-viewer-failed">
                <Text style={{ ...textRole(pairing, 'bodyStrong'), color: colors.ink }}>{t('receipt.viewer.openFailed.label')}</Text>
                <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>{t('receipt.viewer.openFailed.body')}</Text>
                <Pill
                  label={t('receipt.viewer.retry')}
                  variant="primary"
                  onPress={() => {
                    setErrorKey(null);
                    if (isImage) setAttempt((a) => a + 1);
                    else void openFile();
                  }}
                />
              </View>
            ) : isImage ? (
              url !== null ? (
                <ZoomableImage key={url} uri={url} label={t('receipt.thumb.a11y', { n: at + 1, count, kind: kindWord })} onError={() => setErrorKey(fileKey)} />
              ) : null
            ) : (
              <View style={styles.pdf}>
                <Row
                  label={t('receipt.kind.pdf')}
                  sublabel={current.group.state === 'stored' ? undefined : t('receipt.waitingShort')}
                  leading={<IconTile icon="file" color={colors.ink} tint={colors.fill1} />}
                  chevron
                  emphasis
                  disabled={objectPath === null}
                  onPress={objectPath === null ? undefined : () => void openFile()}
                  accessibilityLabel={t('receipt.thumb.a11y', { n: at + 1, count, kind: kindWord })}
                />
              </View>
            )}
          </View>
        </GestureDetector>

        <View style={styles.nav}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('receipt.viewer.previous')}
            accessibilityState={{ disabled: at === 0 }}
            disabled={at === 0}
            onPress={() => go(-1)}
            style={[styles.navBtn, { backgroundColor: colors.fill1, opacity: at === 0 ? 0.4 : 1 }]}
          >
            <View style={styles.flip}>
              <Glyph name="arrowRight" size={20} color={colors.ink} />
            </View>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('receipt.viewer.next')}
            accessibilityState={{ disabled: at >= count - 1 }}
            disabled={at >= count - 1}
            onPress={() => go(1)}
            style={[styles.navBtn, { backgroundColor: colors.fill1, opacity: at >= count - 1 ? 0.4 : 1 }]}
          >
            <Glyph name="arrowRight" size={20} color={colors.ink} />
          </Pressable>
        </View>

        <ConfirmSheet
          visible={confirming}
          body={t('receipt.removeOne.confirm')}
          cancelLabel={t('receipt.removeOne.keep')}
          confirmLabel={t('receipt.removeOne.confirmButton')}
          destructive
          onCancel={() => setConfirming(false)}
          onConfirm={() => {
            setConfirming(false);
            const gone = current.group.groupId;
            const lastGroup = items.every((i) => i.group.groupId === gone);
            onRemove(gone);
            if (lastGroup) onClose();
          }}
        />
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.screenH, minHeight: 56 },
  hit: { minWidth: space.touchMin, minHeight: space.touchMin, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  imageBox: { flex: 1, alignSelf: 'stretch' },
  image: { flex: 1, width: '100%' },
  card: { margin: space.screenH, padding: space.cardPad, borderRadius: radii.card, gap: step.tight, alignSelf: 'stretch' },
  pdf: { alignSelf: 'stretch', paddingHorizontal: space.screenH },
  nav: { flexDirection: 'row', justifyContent: 'center', gap: space.groupGap, paddingVertical: space.gapMd },
  navBtn: { width: space.touchMin, height: space.touchMin, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
  flip: { transform: [{ scaleX: -1 }] },
});
