// D-13: a settings-row group — a heading above a surface card whose rows get 15px padding and a
// 1px line1 separator between them (not above the first row).
// 06.2-15 (D-06, D-24, L04): the heading is the shared SectionHeader, never with an icon.
import { Children, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { SectionHeader } from '@/ui/SectionHeader';
import { useTheme } from '@/theme/ThemeProvider';
import { space, radii, step } from '@/theme/layout';
import { shadows } from '@/theme/tokens';

export interface SettingsGroupProps {
  title: string;
  children: ReactNode;
}

export function SettingsGroup({ title, children }: SettingsGroupProps) {
  const { colors } = useTheme();
  const rows = Children.toArray(children);

  return (
    <View style={styles.wrapper}>
      <View style={styles.heading}>
        <SectionHeader title={title} />
      </View>
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
    marginBottom: space.gapSm,
  },
  card: {
    borderRadius: radii.card,
  },
  // 06.2-15: rows are 52+ tall by themselves (Row, D-09), so the card adds only a hair above and below.
  row: {
    paddingHorizontal: space.rowPad,
    paddingVertical: step.hair,
  },
});
