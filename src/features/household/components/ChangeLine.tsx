// UI-SPEC primitive: one named change. The caller passes the finished sentence (names already through the resolver),
// when it happened, and an Undo handler only while Undo is still allowed (D-14 / D-34).
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/ui/Text';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { rowHeight, space, step } from '@/theme/layout';
import { textRole } from '@/theme/typography';
import { LINK_HIT_SLOP } from '@/ui/pressFeedback';
import { MemberAvatar } from './MemberAvatar';

export interface ChangeLineProps {
  householdId: string | null | undefined;
  actorId: string | null;
  /** The finished sentence, e.g. "Sam changed Groceries to even". */
  text: string;
  /** A time already formatted for display. */
  at: string;
  onUndo?: () => void;
}

export function ChangeLine({ householdId, actorId, text, at, onUndo }: ChangeLineProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  return (
    <View style={[styles.row, { minHeight: rowHeight.two }]}>
      <MemberAvatar householdId={householdId} userId={actorId} size={28} />
      <View style={styles.text} accessible accessibilityLabel={`${text}, ${at}`}>
        <Text style={{ ...textRole(pairing, 'body'), color: colors.ink }}>{text}</Text>
        <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>{at}</Text>
      </View>
      {onUndo ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${t('household.notices.undo')}: ${text}`}
          hitSlop={LINK_HIT_SLOP}
          onPress={onUndo}
          style={styles.undo}
        >
          <Text style={{ ...textRole(pairing, 'label'), color: colors.accent }}>{t('household.notices.undo')}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: step.row, paddingVertical: step.tight },
  text: { flex: 1, flexShrink: 1, gap: 2 },
  undo: { minHeight: space.touchMin, minWidth: space.touchMin, alignItems: 'center', justifyContent: 'center' },
});
