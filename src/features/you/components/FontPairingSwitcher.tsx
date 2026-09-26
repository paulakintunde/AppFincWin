// D-13/D-14/FND-06: four font-pairing rows, each label rendered in that pairing's own
// display face so the option previews itself. `value` is the live theme pairing, so pressing
// a row updates every label's face and the check indicator in the same render tree.
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { FONT_PAIRINGS, type FontPairingKey } from '@/theme/fonts';
import { fontSize } from '@/theme/typography';
import { space } from '@/theme/layout';

export interface FontPairingSwitcherProps {
  value: FontPairingKey;
  onChange: (key: FontPairingKey) => void;
}

const PAIRING_KEYS: FontPairingKey[] = ['bold', 'modern', 'grotesk', 'neutral'];

export function FontPairingSwitcher({ value, onChange }: FontPairingSwitcherProps) {
  const t = useT();
  const { colors } = useTheme();

  return (
    <View>
      {PAIRING_KEYS.map((key) => {
        const selected = key === value;
        return (
          <Pressable
            key={key}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            onPress={() => onChange(key)}
            style={styles.row}
          >
            <Text style={[styles.label, { fontFamily: FONT_PAIRINGS[key].display, color: colors.ink }]}>
              {t(`you.font.${key}`)}
            </Text>
            {/* No icon set ships in Phase 0 (00-UI-SPEC.md) — the selection indicator is a
                plain accent-filled dot, matching ConnectionStatus's own dot convention,
                rather than a checkmark glyph. */}
            <View
              style={[
                styles.indicator,
                { backgroundColor: selected ? colors.accent : 'transparent' },
              ]}
            />
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: space.gapSm,
  },
  label: {
    fontSize: fontSize.body,
  },
  indicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});
