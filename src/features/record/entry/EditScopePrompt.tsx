// D-06/D-07: the "This one / This and future" question, asked before a template edit on an
// occurrence of a recurring series. Nothing is written until one of the two is chosen.
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/layout';
import { textRole } from '@/theme/typography';
import { Pill } from '@/ui/Pill';
import { Sheet } from '@/ui/Sheet';

export interface EditScopePromptProps {
  visible: boolean;
  onThisOne: () => void;
  onThisAndFuture: () => void;
  onCancel: () => void;
  /** True when the series is not loaded, so a series-wide edit cannot be sent. */
  futureDisabled?: boolean;
}

export function EditScopePrompt({ visible, onThisOne, onThisAndFuture, onCancel, futureDisabled = false }: EditScopePromptProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const heading = { ...textRole(pairing, 'sheetTitle'), color: colors.ink };
  const note = { ...textRole(pairing, 'label'), color: colors.inkMuted };

  return (
    <Sheet visible={visible} onDismiss={onCancel} accessibilityLabel={t('record.recurring.scopeHeading')}>
      <View style={styles.column}>
        <Text style={heading}>{t('record.recurring.scopeHeading')}</Text>
        <Pill label={t('record.recurring.scopeThisOne')} variant="secondary" onPress={onThisOne} />
        <Pill
          label={t('record.recurring.scopeThisAndFuture')}
          variant="primary"
          disabled={futureDisabled}
          accessibilityHint={futureDisabled ? t('record.recurring.futureUnavailable') : undefined}
          onPress={onThisAndFuture}
        />
        {futureDisabled ? <Text style={note}>{t('record.recurring.futureUnavailable')}</Text> : null}
        <Pill label={t('record.sheet.cancel')} variant="secondary" onPress={onCancel} />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  column: {
    gap: space.gapSm,
  },
});
