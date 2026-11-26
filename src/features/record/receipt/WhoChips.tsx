// 10.1-27 (SCN-06; D-14; UI-SPEC 6): who shares one receipt item. One chip per household member: the avatar (28) and the name,
// a 44-tall touch target, wrapping onto more lines at large font sizes. A selected chip carries the accent border AND the checkIt
// glyph (never colour alone); an unselected chip has the line2 border. Each chip is a checkbox with its state; the last person
// on an item cannot be taken off (the model refuses it), so that chip is announced as disabled.
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/ui/Text';
import { Glyph } from '@/ui/icons/Glyph';
import { hapticTick } from '@/ui/haptics';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, space, step } from '@/theme/layout';
import { textRole } from '@/theme/typography';
import { MemberAvatar } from '@/features/household/components/MemberAvatar';
import type { ReviewMember } from './scanModel';

export interface WhoChipsProps {
  householdId: string | null;
  members: readonly ReviewMember[];
  /** Member ids on this item. */
  selected: readonly string[];
  /** The item's name, spoken with each chip ("Sam, Oat milk"). */
  itemName: string;
  onToggle(memberId: string): void;
}

export function WhoChips({ householdId, members, selected, itemName, onToggle }: WhoChipsProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  return (
    <View style={styles.wrap} testID="who-chips">
      {members.map((m) => {
        const on = selected.includes(m.id);
        const last = on && selected.length === 1;
        return (
          <Pressable
            key={m.id}
            accessibilityRole="checkbox"
            accessibilityLabel={t('scan.byItem.chipA11y', { name: m.name, item: itemName })}
            accessibilityState={{ checked: on, disabled: last }}
            onPress={() => {
              if (last) return;
              hapticTick();
              onToggle(m.id);
            }}
            style={[styles.chip, { borderColor: on ? colors.accent : colors.line2, backgroundColor: colors.surface }]}
            testID={`who-chip-${m.id}`}
          >
            <MemberAvatar householdId={householdId} userId={m.id} size={28} />
            <Text style={{ ...textRole(pairing, 'label'), color: colors.ink, flexShrink: 1 }}>{m.name}</Text>
            {on ? <Glyph name="checkIt" size={16} color={colors.accent} /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: step.tight },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: step.hair,
    minHeight: space.touchMin,
    paddingLeft: step.hair,
    paddingRight: step.row,
    borderRadius: radii.pill,
    borderWidth: 1.5,
    maxWidth: '100%',
  },
});
