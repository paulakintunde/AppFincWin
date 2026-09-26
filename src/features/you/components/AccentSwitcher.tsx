// D-13/D-14/FND-06: four accent swatches; the selected one carries a 2px ring in the
// currently active accent, offset 2px from the swatch itself. `value` is driven by the live
// theme accent (not the persisted profile row), so pressing a swatch updates the ring in the
// same render tree, before the profile write resolves.
import { Pressable, StyleSheet, View } from 'react-native';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { ACCENTS, ACCENT_KEYS, type AccentKey } from '@/theme/accents';
import { space } from '@/theme/layout';

export interface AccentSwitcherProps {
  value: AccentKey;
  onChange: (key: AccentKey) => void;
}

const SWATCH_SIZE = 32;
const RING_OFFSET = 2;
const RING_WIDTH = 2;
const RING_SIZE = SWATCH_SIZE + 2 * (RING_OFFSET + RING_WIDTH);

export function AccentSwitcher({ value, onChange }: AccentSwitcherProps) {
  const t = useT();
  const { colors } = useTheme();

  return (
    <View style={styles.row}>
      {ACCENT_KEYS.map((key) => {
        const selected = key === value;
        return (
          <Pressable
            key={key}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={t(`you.accent.${key}`)}
            onPress={() => onChange(key)}
            style={styles.touchTarget}
          >
            <View
              testID={`accent-ring-${key}`}
              style={[
                styles.ring,
                { borderColor: selected ? colors.accent : 'transparent' },
              ]}
            >
              <View style={[styles.swatch, { backgroundColor: ACCENTS[key] }]} />
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: space.gapMd,
  },
  touchTarget: {
    width: space.touchMin,
    height: space.touchMin,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    width: RING_SIZE,
    height: RING_SIZE,
    borderRadius: RING_SIZE / 2,
    borderWidth: RING_WIDTH,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swatch: {
    width: SWATCH_SIZE,
    height: SWATCH_SIZE,
    borderRadius: SWATCH_SIZE / 2,
  },
});
