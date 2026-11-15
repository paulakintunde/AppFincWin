// 06-21: two linked fields ("Each month" / "By"). The field last edited gets the accent border and tint; the other shows the
// derived value. After an edit settles, the other field's new value is announced. Stacks above 1.3x font scale. No maths here.
import React, { useEffect, useRef } from 'react';
import { AccessibilityInfo, Platform, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSettledLabel } from '@/ui/useSettledLabel';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, space } from '@/theme/layout';
import { fontSize, textRole } from '@/theme/typography';
import { Text } from '@/ui/Text';
import { TextInput } from '@/ui/TextInput';

export type PairSide = 'first' | 'second';

export interface PairField {
  label: string;
  /** Text shown in the field (typed by the user, or derived when not last edited). */
  value: string;
  onChangeText: (text: string) => void;
  keyboardType?: 'decimal-pad' | 'number-pad' | 'default';
  placeholder?: string;
}

export interface LinkedPairFieldsProps {
  first: PairField;
  second: PairField;
  lastEdited: PairSide;
  /** Spoken sentence for the derived (other) field, e.g. "Reaches October 2028". Announced once settled. */
  derivedAnnouncement?: string;
}

export const STACK_FONT_SCALE = 1.3;
const SETTLE_MS = 600;

export function LinkedPairFields({ first, second, lastEdited, derivedAnnouncement }: LinkedPairFieldsProps) {
  const { fontScale } = useWindowDimensions();
  const { colors, pairing } = useTheme();
  const stacked = fontScale > STACK_FONT_SCALE;
  const settled = useSettledLabel(derivedAnnouncement ?? '', lastEdited, SETTLE_MS);
  const last = useRef(settled);
  useEffect(() => {
    if (settled === last.current) return;
    last.current = settled;
    if (settled && Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility(settled);
  }, [settled]);

  const renderField = (side: PairSide, field: PairField) => {
    const active = lastEdited === side;
    return (
      <View key={side} style={styles.cell}>
        <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.eyebrow, color: colors.inkMuted }}>{field.label}</Text>
        <View
          testID={`pair-${side}-box`}
          style={[
            styles.box,
            {
              minHeight: space.touchMin,
              borderColor: active ? colors.accent : colors.line2,
              backgroundColor: active ? colors.accentTint1 : colors.surface,
            },
          ]}
        >
          <TextInput
            testID={`pair-${side}-input`}
            accessibilityLabel={field.label}
            value={field.value}
            onChangeText={field.onChangeText}
            keyboardType={field.keyboardType ?? 'decimal-pad'}
            placeholder={field.placeholder}
            placeholderTextColor={colors.inkFaint}
            style={{ ...textRole(pairing, 'body'), color: active ? colors.ink : colors.inkDim, minHeight: space.touchMin, padding: 0 }}
          />
        </View>
      </View>
    );
  };

  return (
    <View testID="linked-pair" style={[styles.wrap, stacked ? styles.stacked : styles.side]}>
      {renderField('first', first)}
      {renderField('second', second)}
      {/* P4-IN-05: Android has no announce call that TalkBack reliably reads, so the settled derived value sits in a polite live
          region (as CalcResultCard does). Hidden from sight, 1 x 1 so it takes no room in the row. */}
      {Platform.OS === 'android' ? (
        <View testID="linked-pair-live" accessible={settled !== ''} accessibilityLiveRegion="polite" accessibilityLabel={settled} style={styles.live} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.gapMd },
  side: { flexDirection: 'row' },
  stacked: { flexDirection: 'column' },
  cell: { flex: 1, gap: 4 },
  live: { position: 'absolute', width: 1, height: 1, overflow: 'hidden' },
  box: { borderWidth: 1.5, borderRadius: radii.glyphTile + 3, paddingHorizontal: 12, justifyContent: 'center' },
});
