// UI-SPEC primitive: avatar, name, percentage (heading, always with %), minus / plus in steps of 5 (44 px) and tap-to-type.
// The percentage is the adjustable element (name, weight, percent); the buttons are separate 44 px targets.
// A 0% row says it pays no share of weighted lines.
import React, { useState } from 'react';
import { Pressable, StyleSheet, View, type AccessibilityActionEvent } from 'react-native';
import { Text } from '@/ui/Text';
import { TextInput } from '@/ui/TextInput';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { rowHeight, space, step } from '@/theme/layout';
import { textRole } from '@/theme/typography';
import { useMemberLabel } from '../useMemberLabel';
import { MemberAvatar } from './MemberAvatar';

export const WEIGHT_STEP = 5;

export interface WeightRowProps {
  householdId: string | null | undefined;
  userId: string;
  percent: number;
  /** Called with a whole number 0 to 100. */
  onChange: (next: number) => void;
  /** The role label, spoken with the avatar. */
  role?: string;
  disabled?: boolean;
}

function clampStep(n: number): number {
  return Math.max(0, Math.min(100, n));
}

export function WeightRow({ householdId, userId, percent, onChange, role, disabled = false }: WeightRowProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const label = useMemberLabel(householdId);
  const name = label(userId);
  const weightLabel = (): string =>
    name === t('household.members.you')
      ? t('household.members.weight.a11yYou', { percent })
      : t('household.members.weight.a11y', { name, percent });
  const [typing, setTyping] = useState(false);
  const [text, setText] = useState('');

  const commit = () => {
    setTyping(false);
    const n = Number.parseInt(text, 10);
    if (Number.isFinite(n) && n !== percent) onChange(clampStep(n));
  };
  const bump = (by: number) => onChange(clampStep(percent + by));
  const onAction = (e: AccessibilityActionEvent) => {
    if (e.nativeEvent.actionName === 'increment') bump(WEIGHT_STEP);
    if (e.nativeEvent.actionName === 'decrement') bump(-WEIGHT_STEP);
  };
  const bar = { backgroundColor: disabled ? colors.inkFaint : colors.ink };

  return (
    <View style={[styles.row, { minHeight: percent === 0 ? rowHeight.two : rowHeight.one }]}>
      <MemberAvatar householdId={householdId} userId={userId} size={32} {...(role !== undefined ? { role, percent } : {})} />
      <View style={styles.names}>
        <Text numberOfLines={2} style={{ ...textRole(pairing, 'sheetTitle'), color: colors.ink }}>
          {name}
        </Text>
        {percent === 0 ? (
          <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>{t('household.members.zeroWeight')}</Text>
        ) : null}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('household.members.weights.stepDown', { name })}
        disabled={disabled || percent <= 0}
        onPress={() => bump(-WEIGHT_STEP)}
        style={styles.stepper}
        testID={`weight-down-${userId}`}
      >
        <View style={[styles.barH, bar]} />
      </Pressable>
      {typing ? (
        <TextInput
          testID={`weight-input-${userId}`}
          accessibilityLabel={weightLabel()}
          keyboardType="number-pad"
          maxLength={3}
          autoFocus
          value={text}
          onChangeText={setText}
          onBlur={commit}
          onSubmitEditing={commit}
          style={[textRole(pairing, 'heading'), styles.value, { color: colors.ink, backgroundColor: colors.fill1 }]}
        />
      ) : (
        <Pressable
          accessibilityRole="adjustable"
          accessibilityLabel={weightLabel()}
          accessibilityValue={{ min: 0, max: 100, now: percent }}
          accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
          onAccessibilityAction={onAction}
          disabled={disabled}
          onPress={() => {
            setText(String(percent));
            setTyping(true);
          }}
          style={styles.value}
          testID={`weight-value-${userId}`}
        >
          <Text scale="capped" style={{ ...textRole(pairing, 'heading'), color: colors.ink, fontVariant: ['tabular-nums'] }}>
            {t('household.members.weight.value', { percent })}
          </Text>
        </Pressable>
      )}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('household.members.weights.stepUp', { name })}
        disabled={disabled || percent >= 100}
        onPress={() => bump(WEIGHT_STEP)}
        style={styles.stepper}
        testID={`weight-up-${userId}`}
      >
        <View style={[styles.barH, bar]} />
        <View style={[styles.barV, bar]} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: step.tight, paddingVertical: space.rowPadDense },
  names: { flex: 1, flexShrink: 1, gap: step.hair },
  stepper: { width: space.touchMin, height: space.touchMin, alignItems: 'center', justifyContent: 'center' },
  barH: { position: 'absolute', width: 14, height: 2, borderRadius: 1 },
  barV: { position: 'absolute', width: 2, height: 14, borderRadius: 1 },
  value: { minWidth: 64, minHeight: space.touchMin, alignItems: 'center', justifyContent: 'center', textAlign: 'center', borderRadius: 8 },
});
