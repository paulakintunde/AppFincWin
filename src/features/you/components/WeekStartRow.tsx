// ACT-16, CONTEXT D-23: Monday or Sunday, applied at once with no confirm. The value comes
// from the record context (stored setting, else the device region default, else Monday).
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useUpdateRecordPrefs } from '@/data/mutations/recordPrefs';
import { useRecordContext } from '@/features/record/useRecordContext';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { textRole } from '@/theme/typography';
import { Dropdown } from '@/ui/Dropdown';

type WeekKey = '0' | '1';

export function WeekStartRow() {
  const t = useT();
  const { colors, pairing } = useTheme();
  const { weekStart, userId } = useRecordContext();
  const { setWeekStart } = useUpdateRecordPrefs(userId ?? '');

  return (
    <View>
      <Dropdown<WeekKey>
        variant="row"
        rowLabel={t('you.weekStart.label')}
        title={t('you.weekStart.label')}
        triggerA11yLabel={t('you.weekStart.label')}
        disabled={userId === null}
        value={String(weekStart) as WeekKey}
        options={[
          { key: '1', label: t('you.weekStart.monday') },
          { key: '0', label: t('you.weekStart.sunday') },
        ]}
        onSelect={(key) => setWeekStart(Number(key) as 0 | 1)}
      />
      <Text style={[styles.sub, { ...textRole(pairing, 'label'), color: colors.inkMuted }]}>
        {t('you.weekStart.sub')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  sub: { marginTop: -4 },
});
