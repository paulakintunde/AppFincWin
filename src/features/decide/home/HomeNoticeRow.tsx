// 05-116 (D-96, UI-SPEC R17.5): the one quiet row under the Decide header that says something needs a look. It renders
// noticeRowModel and nothing else: no fill, never red. The 8px warn1 dot is shown only when the model says so (real
// problems, and offline with writes waiting); slow saves and waiting writes show the text alone (M4).
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useT } from '@/i18n';
import { PRESSED_OPACITY, space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { textRole } from '@/theme/typography';
import type { SyncLabel } from '@/ui/syncStatusLabel';
import { Text } from '@/ui/Text';
import type { NoticeRowModel } from './homeProblems';

const DOT = 8;
const CHEVRON = 8;

type Translate = ReturnType<typeof useT>;

/** The sync label as the notice row reads it (capitalised, R17.6); the waiting count has no notice key and reuses sync.waiting. */
export function syncLabelText(t: Translate, label: SyncLabel): string {
  const count = label.count ?? 0;
  switch (label.key) {
    case 'sync.offline':
      return t('decide.home.notice.offline');
    case 'sync.offlineWaiting':
      return t('decide.home.notice.offlineWaiting', { count });
    case 'sync.saving':
      return t('decide.home.notice.saving');
    case 'sync.waiting':
      return t('sync.waiting', { count });
    default:
      return t(label.key, { count });
  }
}

export interface HomeNoticeRowProps {
  model: NoticeRowModel;
  onPress: () => void;
}

export function HomeNoticeRow({ model, onPress }: HomeNoticeRowProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  if (!model.visible) return null;
  const text = model.text.kind === 'items' ? t('decide.home.notice.items', { count: model.text.count }) : syncLabelText(t, model.text.label);
  return (
    <Pressable
      testID="home-notice-row"
      accessibilityRole="button"
      accessibilityLabel={text}
      accessibilityHint={t('decide.home.notice.hint')}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && { opacity: PRESSED_OPACITY }]}
    >
      {model.dot ? <View testID="home-notice-dot" style={[styles.dot, { backgroundColor: colors.warn1 }]} /> : null}
      <Text style={[styles.text, textRole(pairing, 'label'), { color: colors.ink }]}>{text}</Text>
      <View style={[styles.chevron, { borderColor: colors.inkSoft3 }]} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { minHeight: space.touchMin, flexDirection: 'row', alignItems: 'center', gap: space.gapSm },
  dot: { width: DOT, aspectRatio: 1, borderRadius: DOT / 2 },
  text: { flex: 1 },
  chevron: { width: CHEVRON, aspectRatio: 1, borderTopWidth: 2, borderRightWidth: 2, transform: [{ rotate: '45deg' }] },
});
