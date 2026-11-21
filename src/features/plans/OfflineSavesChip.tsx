/**
 * 09-18 (UI-SPEC 9d, D-40): the Activity header chip for writes kept on the phone: the savedOffline glyph and the count;
 * opens the kept items. Renders nothing at zero. Kept apart from the Home notice so the header does not depend on plan state.
 * 09-25 (A2-W): hidden in sample, like the notice. It reads the guard's plan snapshot, not the plan query, for that reason.
 */
import React, { useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { useT } from '@/i18n';
import { useLockedWrites } from '@/data/sync/lockedWrites';
import { usePlanWriteState } from '@/data/sync/planWriteGuard';
import { Text } from '@/ui/Text';
import { Glyph } from '@/ui/icons/Glyph';
import { PRESSED_OPACITY, radii, space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { textRole } from '@/theme/typography';
import { LockedWritesSheet } from './LockedWritesSheet';

export function OfflineSavesChip() {
  const t = useT();
  const count = useLockedWrites().length;
  const { colors, pairing } = useTheme();
  const plan = usePlanWriteState();
  const [open, setOpen] = useState(false);
  if (count === 0 || plan?.status === 'sample') return null;
  return (
    <>
      <Pressable
        testID="offline-saves-chip"
        accessibilityRole="button"
        accessibilityLabel={`${t('lock.savedOffline.title')}. ${t('lock.savedOffline.body', { count })}`}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.chip, { backgroundColor: colors.fill1 }, pressed ? { opacity: PRESSED_OPACITY } : null]}
      >
        <Glyph name="savedOffline" size={16} color={colors.inkDim} />
        <Text style={{ ...textRole(pairing, 'label'), color: colors.ink }}>{String(count)}</Text>
      </Pressable>
      <LockedWritesSheet visible={open} onClose={() => setOpen(false)} />
    </>
  );
}

const styles = StyleSheet.create({
  chip: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.gapSm,
    minHeight: space.touchMin,
    paddingHorizontal: space.gapMd,
    borderRadius: radii.pill,
  },
});
