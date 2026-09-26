// D-13: a settings-row group — an all-caps label heading above a surface card whose rows
// get 15px padding and a 1px line1 separator between them (not above the first row).
import { Children, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { space, radii } from '@/theme/layout';
import { fontSize } from '@/theme/typography';
import { shadows } from '@/theme/tokens';

export interface SettingsGroupProps {
  title: string;
  children: ReactNode;
}

export function SettingsGroup({ title, children }: SettingsGroupProps) {
  const { colors, fonts } = useTheme();
  const rows = Children.toArray(children);

  return (
    <View style={styles.wrapper}>
      <Text
        style={[
          styles.heading,
          { fontFamily: fonts.body[600], color: colors.inkDim },
        ]}
      >
        {title}
      </Text>
      <View style={[styles.card, shadows.card, { backgroundColor: colors.surface }]}>
        {rows.map((row, index) => (
          <View
            key={index}
            style={[styles.row, index > 0 && { borderTopWidth: 1, borderTopColor: colors.line1 }]}
          >
            {row}
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginTop: space.groupGap,
  },
  heading: {
    fontSize: fontSize.label,
    lineHeight: fontSize.label * 1.4,
    letterSpacing: fontSize.label * 0.11,
    textTransform: 'uppercase',
    marginBottom: space.gapSm,
  },
  card: {
    borderRadius: radii.card,
  },
  row: {
    padding: space.rowPad,
  },
});
