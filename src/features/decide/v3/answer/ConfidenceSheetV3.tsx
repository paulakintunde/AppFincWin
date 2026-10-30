/**
 * 05.3-25 (UI-SPEC Hero): "How sure this answer is". One sentence per reason key from confidenceChip(), the header Close control. Built on the shared Sheet (modal, so focus stays inside and returns to the chip on close).
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import type { Confidence } from '@/engine/decide/v3';
import { useT } from '@/i18n';
import { space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { textRole } from '@/theme/typography';
import { Sheet, SheetScroll } from '@/ui/Sheet';
import { SheetHeader } from '@/ui/SheetHeader';
import { Text } from '@/ui/Text';
import { confidenceChip } from '../model/confidence';

export interface ConfidenceSheetV3Props {
  visible: boolean;
  confidence: Confidence;
  onClose: () => void;
}

const ROW_MIN = 44;

export function ConfidenceSheetV3({ visible, confidence, onClose }: ConfidenceSheetV3Props): React.JSX.Element {
  const t = useT() as (key: string) => string;
  const { colors, pairing } = useTheme();
  const { reasonKeys } = confidenceChip(confidence);
  const title = t('decide.v3.ui.confidence.sheetTitle');
  const close = t('decide.v3.ui.confidence.close');
  return (
    <Sheet visible={visible} onDismiss={onClose} accessibilityLabel={title}>
      <SheetHeader title={title} cancelLabel={close} onCancel={onClose} />
      <SheetScroll>
        <View style={styles.rows}>
          {reasonKeys.map((key) => (
            <View key={key} style={styles.row} accessible accessibilityLabel={t(key)}>
              <Text style={{ ...textRole(pairing, 'body'), color: colors.ink }}>{t(key)}</Text>
            </View>
          ))}
        </View>
      </SheetScroll>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  rows: { gap: space.gapSm },
  row: { minHeight: ROW_MIN, justifyContent: 'center' },
});
