// 05.3-24 (UI-SPEC "How will you pay?"): All at once / Periodic payments. SegmentedToggle becomes a vertical radio list under rule S.
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { SegmentedToggle } from '@/features/decide/ui/SegmentedToggle';
import { useT } from '@/i18n';
import { space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { textRole } from '@/theme/typography';
import { Text } from '@/ui/Text';

export interface PayToggleProps {
  mode: 'once' | 'plan';
  onChange(mode: 'once' | 'plan'): void;
  readOnly?: boolean;
}

export function PayToggle({ mode, onChange, readOnly = false }: PayToggleProps): React.JSX.Element {
  const t = useT();
  const { colors, pairing } = useTheme();
  return (
    <View style={styles.group}>
      <Text accessibilityRole="header" style={{ ...textRole(pairing, 'label'), color: colors.inkDim }}>
        {t('decide.v3.ui.check.pay')}
      </Text>
      <SegmentedToggle
        accessibilityLabel={t('decide.v3.ui.check.pay')}
        value={mode}
        onChange={(key) => {
          if (!readOnly) onChange(key === 'plan' ? 'plan' : 'once');
        }}
        options={[
          { key: 'once', label: t('decide.v3.ui.check.payOnce') },
          { key: 'plan', label: t('decide.v3.ui.check.payPlan') },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: space.gapSm },
});
