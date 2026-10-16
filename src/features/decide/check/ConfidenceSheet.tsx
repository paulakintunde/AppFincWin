/**
 * 05-41 (D-28): "What this rests on". One row per reason from the engine's confidence codes plus the builder facts
 * (full months, steadiness, one-offs left out, converted currencies), the footer that states the thresholds, and Close.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import type { Confidence } from '@/engine/decide';
import { useT } from '@/i18n';
import { DetailSheet } from '@/ui/DetailSheet';
import { Pill } from '@/ui/Pill';
import { Text } from '@/ui/Text';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/layout';
import { fontSize, textRole } from '@/theme/typography';
import { confidenceReasons, type ConfidenceFacts } from '../copy/depthVerdictCopy';
import { refText, type Translate } from './refText';

export interface ConfidenceSheetProps {
  visible: boolean;
  confidence: Confidence;
  facts: ConfidenceFacts;
  onClose: () => void;
}

export function ConfidenceSheet({ visible, confidence, facts, onClose }: ConfidenceSheetProps) {
  const t = useT() as Translate;
  const { colors, pairing } = useTheme();
  const rows = confidenceReasons(confidence, facts);
  const title = t('decide.depth.confidence.sheetTitle');
  return (
    <DetailSheet
      visible={visible}
      onDismiss={onClose}
      accessibilityLabel={title}
      title={title}
      actions={<Pill label={t('decide.depth.confidence.close')} variant="secondary" onPress={onClose} />}
    >
      <View style={styles.rows}>
        {rows.map((r, i) => (
          <Text key={`${r.key}-${i}`} style={{ ...textRole(pairing, 'body'), color: colors.ink }}>
            {refText(t, r)}
          </Text>
        ))}
        <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkMuted }}>
          {t('decide.depth.confidence.footer')}
        </Text>
      </View>
    </DetailSheet>
  );
}

const styles = StyleSheet.create({ rows: { gap: space.gapMd } });
