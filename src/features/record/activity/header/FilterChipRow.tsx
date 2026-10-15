// Band 4 filter part (D-65..D-67): one chip per active filter with its own x, sideways scroll and a
// "Clear all" chip at three or more. Unpaid is never a chip (D-66): the row renders only the models it is given.
import React, { useEffect, useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/ui/Text';
import { Chip } from '@/ui/Chip';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { PRESSED_OPACITY, radii, space } from '@/theme/layout';
import { ACCENT_TINT_OPACITY } from '@/theme/tokens';
import { textRole } from '@/theme/typography';
import { focusAccessibility } from '@/shell/a11yFocus';
import { CloseGlyph } from './HeaderGlyphs';
import type { FilterChipModel, FilterKind } from './activeFilters';

export const CLEAR_ALL_FROM = 3; // D-67

export interface FilterChipProps {
  model: FilterChipModel;
  onOpen: () => void;
  onRemove: (kind: FilterKind) => void;
  labelRef?: React.Ref<View>;
}

export function FilterChip({ model, onOpen, onRemove, labelRef }: FilterChipProps) {
  const { colors, pairing } = useTheme();
  const t = useT();
  return (
    <View style={[styles.chip, { backgroundColor: colors.fill1 }]}>
      <View
        testID="accent-tint"
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: colors.accent, opacity: ACCENT_TINT_OPACITY, borderRadius: radii.pill },
        ]}
      />
      <Pressable
        ref={labelRef}
        accessibilityRole="button"
        accessibilityLabel={t('activity.filterChip.openA11y', { label: model.label })}
        onPress={onOpen}
        style={({ pressed }) => [styles.label, pressed ? { opacity: PRESSED_OPACITY } : null]}
      >
        <Text numberOfLines={1} style={{ ...textRole(pairing, 'label'), color: colors.accent }}>
          {model.label}
        </Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('activity.filterChip.removeA11y', { label: model.label })}
        onPress={() => onRemove(model.kind)}
        style={({ pressed }) => [styles.remove, pressed ? { opacity: PRESSED_OPACITY } : null]}
      >
        <CloseGlyph color={colors.accent} />
      </Pressable>
    </View>
  );
}

export interface FilterChipRowProps {
  leading: React.ReactNode;
  leadingFocusRef: React.RefObject<View | null>;
  chips: readonly FilterChipModel[];
  onOpenFilters: () => void;
  onRemove: (kind: FilterKind) => void;
  onClearAll: () => void;
}

export function FilterChipRow({
  leading,
  leadingFocusRef,
  chips,
  onOpenFilters,
  onRemove,
  onClearAll,
}: FilterChipRowProps) {
  const t = useT();
  const refs = useRef<(View | null)[]>([]);
  const pendingFocus = useRef<number | null>(null);

  // UI-SPEC: removing a filter moves focus to the next chip, or to the Display chip when none remain.
  useEffect(() => {
    const i = pendingFocus.current;
    if (i === null) return;
    pendingFocus.current = null;
    const target =
      chips.length === 0
        ? leadingFocusRef.current
        : (refs.current[i] ?? refs.current[chips.length - 1] ?? leadingFocusRef.current);
    focusAccessibility(target);
  }, [chips.length, leadingFocusRef]);

  const scrolls = chips.length >= CLEAR_ALL_FROM;
  const items = (
    <>
      {leading}
      {chips.map((c, i) => (
        <FilterChip
          key={c.kind}
          model={c}
          labelRef={(node) => {
            refs.current[i] = node;
          }}
          onOpen={onOpenFilters}
          onRemove={(kind) => {
            pendingFocus.current = i;
            onRemove(kind);
          }}
        />
      ))}
      {scrolls ? (
        <Chip
          label={t('activity.filter.clearAll')}
          onPress={() => {
            // Review WR-07: Clear all removes every chip, so focus goes to the Display chip.
            pendingFocus.current = 0;
            onClearAll();
          }}
        />
      ) : null}
    </>
  );

  // Review WR-06 / UI-SPEC line 309: the row always scrolls sideways (one line, never wraps), so at
  // 320pt or 2x text a trailing chip and its x stay reachable even below three chips. "Clear all"
  // still only joins at three or more (D-67).
  return (
    <ScrollView
      testID={scrolls ? 'filter-chip-scroll' : 'filter-chip-row'}
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.scrollContent}
    >
      {items}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: space.touchMin,
    borderRadius: radii.pill,
    overflow: 'hidden',
  },
  label: { paddingLeft: space.gapMd, justifyContent: 'center', minHeight: space.touchMin },
  remove: {
    minWidth: space.touchMin,
    minHeight: space.touchMin,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: { gap: space.gapSm, paddingRight: space.screenH, alignItems: 'center' },
});
