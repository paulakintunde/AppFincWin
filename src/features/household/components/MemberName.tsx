// D-32: the only component that renders a member's name. Every Household screen shows a person through this (or through
// useMemberLabel directly for a plain string); a test fails if any other feature file reads the name columns.
import React from 'react';
import type { StyleProp, TextStyle } from 'react-native';
import { Text } from '@/ui/Text';
import { useTheme } from '@/theme/ThemeProvider';
import { textRole } from '@/theme/typography';
import { useMemberLabel } from '../useMemberLabel';

export interface MemberNameProps {
  householdId: string | null | undefined;
  userId: string | null;
  /** The person has since left the household: adds "(left)". */
  left?: boolean;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
}

export function MemberName({ householdId, userId, left, style, numberOfLines }: MemberNameProps) {
  const label = useMemberLabel(householdId);
  const { colors, pairing } = useTheme();
  return (
    <Text
      numberOfLines={numberOfLines}
      style={[{ ...textRole(pairing, 'sheetTitle'), color: left ? colors.inkMuted : colors.ink, flexShrink: 1 }, style]}
    >
      {label(userId, { left })}
    </Text>
  );
}
