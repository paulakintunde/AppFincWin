// 06.1-24: small pieces items 1 and 2 (and the item screens of plan 25) share: money and ordinal words, the day-of-month field,
// and the how-often chips. 06.1-54 (A-SU-4): the day picker (1 to 31 as chips in a sheet) for Pay's "Which day?".
import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useT } from '@/i18n';
import { space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { textRole } from '@/theme/typography';
import { RadioDot } from '@/ui/RadioDot';
import { Sheet, SheetScroll } from '@/ui/Sheet';
import { SheetHeader } from '@/ui/SheetHeader';
import { Text } from '@/ui/Text';
import { hapticTick } from '@/ui/haptics';
import { DayGrid, FieldLabel, useSetupFormat } from '@/features/record/forms/formFields';

// 05.5-17: these pieces moved to the shared forms folder; re-exported so the other Decide setup files import them as before.
export { DayField, DayGrid, FreqChips, dayFromText, useFreqWord, useSetupFormat } from '@/features/record/forms/formFields';
export type { SetupFormat } from '@/features/record/forms/formFields';

/**
 * 06.1-54 (A-SU-4): a boxed field that shows the picked day and opens a sheet of day chips; never free text. `emptyText` is said
 * when no day is picked yet.
 */
export function DayPicker({ label, day, emptyText, onChange }: { label: string; day: number | null; emptyText: string; onChange: (day: number) => void }) {
  const t = useT();
  const fmt = useSetupFormat();
  const { colors, pairing } = useTheme();
  const [open, setOpen] = useState(false);
  const shown = day === null ? emptyText : fmt.ordinal(day);
  return (
    <View style={styles.column}>
      <FieldLabel>{label}</FieldLabel>
      <Pressable
        testID="day-picker"
        accessibilityRole="button"
        accessibilityLabel={`${label} ${shown}`}
        onPress={() => {
          hapticTick();
          setOpen(true);
        }}
        style={[styles.box, { backgroundColor: colors.fill6 }]}
      >
        <Text style={{ ...textRole(pairing, 'body'), color: day === null ? colors.inkMuted : colors.ink }}>{shown}</Text>
      </Pressable>
      {open ? (
        <Sheet visible onDismiss={() => setOpen(false)} accessibilityLabel={label}>
          <SheetHeader title={label} cancelLabel={t('decide.screens.common.cancel')} onCancel={() => setOpen(false)} />
          <SheetScroll contentContainerStyle={styles.column}>
            <DayGrid
              label={label}
              day={day}
              onPick={(d) => {
                setOpen(false);
                onChange(d);
              }}
            />
          </SheetScroll>
        </Sheet>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  column: { gap: space.gapSm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.gapSm },
  radio: { minHeight: space.touchMin, flexDirection: 'row', alignItems: 'center', gap: space.gapMd },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.gapSm },
  cell: { minWidth: space.touchMin },
  box: { minHeight: space.touchMin, borderRadius: space.cardPad, paddingHorizontal: space.cardPad, justifyContent: 'center' },
});

/** A one-choice row with a radio dot, 44 high at least. Rows of one question sit in a `radiogroup` view. */
export function RadioRow({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const { colors, pairing } = useTheme();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ selected, checked: selected }}
      onPress={() => {
        hapticTick();
        onPress();
      }}
      style={styles.radio}
    >
      <RadioDot selected={selected} />
      <Text style={{ ...textRole(pairing, 'body'), color: colors.ink, flexShrink: 1 }}>{label}</Text>
    </Pressable>
  );
}
