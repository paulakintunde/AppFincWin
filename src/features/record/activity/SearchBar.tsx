// Activity search (ACT-03): a text field plus a This month / Every month scope. Typing is
// debounced 250 ms before it reaches the screen; clearing is immediate. Chrome stays in
// fill1 / ink tokens so the list keeps visual priority.
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View, type TextInput as RNTextInput } from 'react-native';
import { Text } from '@/ui/Text';
import { TextInput } from '@/ui/TextInput';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { PRESSED_OPACITY, radii, space } from '@/theme/layout';
import { textRole } from '@/theme/typography';
import { Chip } from '@/ui/Chip';

export type SearchScope = 'month' | 'all';

export const SEARCH_DEBOUNCE_MS = 250;

export interface SearchBarProps {
  term: string;
  scope: SearchScope;
  monthLabel: string;
  onTermChange: (term: string) => void;
  onScopeChange: (scope: SearchScope) => void;
  /** 03.1 D-59: when set, a Cancel button renders after the field. */
  onCancel?: () => void;
  autoFocus?: boolean;
  inputRef?: React.Ref<RNTextInput>;
}

export function SearchBar({
  term,
  scope,
  monthLabel,
  onTermChange,
  onScopeChange,
  onCancel,
  autoFocus,
  inputRef,
}: SearchBarProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const [text, setText] = useState(term);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep the field in step when the screen changes the term (for example a reset).
  const [prevTerm, setPrevTerm] = useState(term);
  if (prevTerm !== term) {
    setPrevTerm(term);
    setText(term);
  }

  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    []
  );

  const onChange = (next: string) => {
    setText(next);
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = setTimeout(() => onTermChange(next), SEARCH_DEBOUNCE_MS);
  };

  const clearTerm = () => {
    if (timer.current !== null) clearTimeout(timer.current);
    setText('');
    onTermChange('');
  };

  const placeholder = scope === 'month' ? t('activity.searchMonth', { month: monthLabel }) : t('activity.searchAll');

  return (
    <View style={styles.wrap}>
      <View style={styles.fieldRow}>
        <View style={[styles.field, { backgroundColor: colors.fill1 }]}>
          <TextInput
            ref={inputRef}
            autoFocus={autoFocus}
            accessibilityLabel={placeholder}
            placeholder={placeholder}
            placeholderTextColor={colors.inkMuted}
            value={text}
            onChangeText={onChange}
            autoCorrect={false}
            returnKeyType="search"
            style={[textRole(pairing, 'body'), styles.input, { color: colors.ink }]}
          />
          {text !== '' ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('activity.searchClear')}
              onPress={clearTerm}
              style={styles.clear}
            >
              <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>×</Text>
            </Pressable>
          ) : null}
        </View>
        {onCancel ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('activity.search.cancelA11y')}
            onPress={onCancel}
            style={({ pressed }) => [styles.cancel, { opacity: pressed ? PRESSED_OPACITY : 1 }]}
          >
            <Text style={{ ...textRole(pairing, 'body'), color: colors.ink }}>{t('activity.search.cancel')}</Text>
          </Pressable>
        ) : null}
      </View>
      <View style={styles.scopes}>
        <Chip label={t('activity.searchScopeMonth')} selected={scope === 'month'} onPress={() => onScopeChange('month')} />
        <Chip label={t('activity.searchScopeAll')} selected={scope === 'all'} onPress={() => onScopeChange('all')} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: space.gapSm,
  },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.gapSm,
  },
  field: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radii.card / 2,
    minHeight: space.touchMin,
    paddingHorizontal: space.gapMd,
  },
  input: {
    flex: 1,
    minHeight: space.touchMin,
  },
  clear: {
    minWidth: space.touchMin,
    minHeight: space.touchMin,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancel: {
    minWidth: space.touchMin,
    minHeight: space.touchMin,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scopes: {
    flexDirection: 'row',
    gap: space.gapSm,
  },
});
