// The choose-mode stage (REC-26, D-01, D-29): after the format (and mapping) step the import
// pauses on one plain choice, with the overlap stated -- always shown, even at zero. The view
// is nothing but words: no colour coding, accent only on the indicator while checking.
import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { useT } from '@/i18n';
import { Pill } from '@/ui/Pill';
import { Row } from '@/ui/Row';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/layout';
import { Actions, Heading, T } from './importUi';
import type { useStatementImport } from './useStatementImport';

type ImportState = ReturnType<typeof useStatementImport>;

/** A disclosure row: the shared Row look with the expanded state announced. */
export function DisclosureRow({
  label,
  expanded,
  onPress,
}: {
  label: string;
  expanded: boolean;
  onPress: () => void;
}): React.ReactElement {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ expanded }} onPress={onPress}>
      <Row label={label} chevron />
    </Pressable>
  );
}

function Choice({
  label,
  sublabel,
  disabled = false,
  onChoose,
}: {
  label: string;
  sublabel: string;
  disabled?: boolean;
  onChoose: () => void;
}): React.ReactElement {
  if (disabled) {
    return (
      <View
        accessible
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={sublabel}
        accessibilityState={{ disabled: true }}
        style={styles.disabled}
      >
        <Row label={label} sublabel={sublabel} chevron />
      </View>
    );
  }
  return <Row label={label} sublabel={sublabel} chevron onPress={onChoose} />;
}

export function ReconcileChoice({ state }: { state: ImportState }) {
  const t = useT();
  const { colors } = useTheme();

  if (state.preview === null) {
    return (
      <View>
        <View style={styles.checking}>
          <ActivityIndicator color={colors.accent} />
          <View accessibilityLiveRegion="polite">
            <T>{t('importCsv.mode.checking')}</T>
          </View>
        </View>
        <Actions>
          <Pill label={t('importCsv.cancel')} variant="secondary" onPress={state.cancel} />
        </Actions>
      </View>
    );
  }

  const overlap = !state.existingChecked
    ? t('importCsv.mode.unchecked')
    : state.overlapCount === 0
      ? t('importCsv.mode.overlapNone')
      : t('importCsv.mode.overlap', { count: state.overlapCount });

  return (
    <View>
      <Heading>{t('importCsv.mode.heading')}</Heading>
      <T tone="inkMuted">{overlap}</T>
      <View style={styles.choices}>
        <Choice
          label={t('importCsv.mode.reconcile')}
          sublabel={state.existingChecked ? t('importCsv.mode.reconcileSub') : t('importCsv.mode.reconcileUnavailable')}
          disabled={!state.existingChecked}
          onChoose={() => state.chooseMode('reconcile')}
        />
        <Choice label={t('importCsv.mode.fresh')} sublabel={t('importCsv.mode.freshSub')} onChoose={() => state.chooseMode('new')} />
      </View>
      <Actions>
        <Pill label={t('importCsv.back')} variant="secondary" onPress={state.back} />
        <Pill label={t('importCsv.cancel')} variant="secondary" onPress={state.cancel} />
      </Actions>
    </View>
  );
}

const styles = StyleSheet.create({
  checking: { alignItems: 'center', gap: space.gapMd, paddingVertical: space.groupGap },
  choices: { paddingTop: space.gapMd },
  disabled: { opacity: 0.4 },
});
