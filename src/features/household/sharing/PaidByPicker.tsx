// 08-19 (D-18): who paid. Options are the household's members, named through the resolver; the default is the person
// logging the line ("You"). Picking someone else shows a helper: they will see the line marked logged by you and can edit
// the amount. One row opens a small choice list; no other state lives here.
import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/ui/Text';
import { Sheet } from '@/ui/Sheet';
import { RadioDot } from '@/ui/RadioDot';
import { hapticTick } from '@/ui/haptics';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { rowHeight, step } from '@/theme/layout';
import { textRole } from '@/theme/typography';
import type { HouseholdMemberRow } from '@/db/householdMembers';
import { MemberAvatar } from '../components/MemberAvatar';
import { useMemberLabel } from '../useMemberLabel';

export interface PaidByPickerProps {
  householdId: string | null | undefined;
  members: readonly HouseholdMemberRow[];
  /** The signed-in user: the default payer. */
  viewerId: string | null;
  /** User id of the payer. */
  value: string | null;
  onChange: (userId: string) => void;
  /** The viewer may not change who paid (a non-creator, non-payer on someone else's line). */
  disabled?: boolean;
}

export function PaidByPicker({ householdId, members, viewerId, value, onChange, disabled = false }: PaidByPickerProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const label = useMemberLabel(householdId);
  const [open, setOpen] = useState(false);
  const payer = value ?? viewerId;
  const payerName = label(payer);
  const other = payer !== null && payer !== viewerId;
  return (
    <View>
      <Pressable
        testID="paid-by-row"
        accessibilityRole="button"
        accessibilityLabel={t('household.sharing.paidByA11y', { name: payerName })}
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={() => setOpen(true)}
        style={[styles.row, { minHeight: rowHeight.one }]}
      >
        <Text style={{ ...textRole(pairing, 'body'), color: colors.ink, flex: 1 }}>{t('household.sharing.paidBy')}</Text>
        <MemberAvatar householdId={householdId} userId={payer} size={28} />
        <Text style={{ ...textRole(pairing, 'body'), color: colors.inkMuted }}>{payerName}</Text>
      </Pressable>
      {other ? (
        <Text testID="paid-by-helper" style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>
          {t('household.sharing.paidByHelper', { name: payerName })}
        </Text>
      ) : null}
      <Sheet visible={open} onDismiss={() => setOpen(false)} accessibilityLabel={t('household.sharing.paidBy')}>
        <View accessibilityRole="radiogroup" accessibilityLabel={t('household.sharing.paidBy')}>
          {members.map((m) => {
            const selected = m.user_id === payer;
            const name = label(m.user_id);
            return (
              <Pressable
                key={m.user_id}
                testID={`paid-by-${m.user_id}`}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected, selected }}
                accessibilityLabel={t('household.sharing.paidByOption', { name })}
                onPress={() => {
                  hapticTick();
                  onChange(m.user_id);
                  setOpen(false);
                }}
                style={[styles.row, { minHeight: rowHeight.one }]}
              >
                <RadioDot selected={selected} />
                <MemberAvatar householdId={householdId} userId={m.user_id} size={28} />
                <Text style={{ ...textRole(pairing, 'body'), color: colors.ink, flex: 1 }}>{name}</Text>
              </Pressable>
            );
          })}
        </View>
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: step.row },
});
