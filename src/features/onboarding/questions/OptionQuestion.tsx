// 09-21 UI-SPEC 2: RadioDot rows, 64 minimum, title bodyStrong, sub label in inkMuted. Rows grow to two lines before truncating.
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/ui/Text';
import { RadioDot } from '@/ui/RadioDot';
import { hapticTick } from '@/ui/haptics';
import { useTheme } from '@/theme/ThemeProvider';
import { PRESSED_OPACITY, radii, space } from '@/theme/layout';
import { textRole } from '@/theme/typography';
import { useCopy } from '../useCopy';
import { OPTION_TABLE, type OptionQuestionKey } from './optionTables';

export interface OptionQuestionProps {
  question: OptionQuestionKey;
  value: string | undefined;
  onChange: (value: string) => void;
}

export function OptionQuestion({ question, value, onChange }: OptionQuestionProps) {
  const t = useCopy();
  const { colors, pairing } = useTheme();
  return (
    <View accessibilityRole="radiogroup" style={styles.group}>
      {OPTION_TABLE[question].map((o) => {
        const selected = value === o.value;
        const title = t(o.titleKey);
        const sub = o.subKey ? t(o.subKey) : undefined;
        return (
          <Pressable
            key={o.value}
            testID={`onb-option-${question}-${o.value}`}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected }}
            accessibilityLabel={sub ? `${title}. ${sub}` : title}
            onPress={() => {
              hapticTick();
              onChange(o.value);
            }}
            style={({ pressed }) => [
              styles.row,
              {
                backgroundColor: colors.surface,
                borderColor: selected ? colors.accent : colors.line2,
                opacity: pressed ? PRESSED_OPACITY : 1,
              },
            ]}
          >
            <RadioDot selected={selected} />
            <View style={styles.text}>
              <Text style={{ ...textRole(pairing, 'bodyStrong'), color: colors.ink }}>{title}</Text>
              {sub ? <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>{sub}</Text> : null}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: space.gapSm },
  row: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.gapMd,
    paddingVertical: space.gapMd,
    paddingHorizontal: space.cardPad,
    borderRadius: radii.card,
    borderWidth: 1.5,
  },
  text: { flex: 1, flexShrink: 1, gap: 2 },
});
