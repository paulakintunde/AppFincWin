/**
 * D-70 / UI-SPEC R1, R7: the shared explanation sheet. Term heading (focused on open), 1-3 declarative sentences and a
 * "What this changes" tile, then Close. It grows with its content and is never dirty. All copy comes from infoCopy.
 */
import React, { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { useT } from '@/i18n';
import { Sheet } from '@/ui/Sheet';
import { Pill } from '@/ui/Pill';
import { Text } from '@/ui/Text';
import { ReadOnlyScope } from '@/ui/ReadOnlyScope';
import { useTheme } from '@/theme/ThemeProvider';
import { space, useScreenInsets } from '@/theme/layout';
import { fontSize, textRole } from '@/theme/typography';
import { focusAccessibility } from '@/shell/a11yFocus';
import { infoCopy, type InfoDynamic, type InfoKey } from '../copy/infoTerms';
import { refText, type Translate } from '../check/refText';

export interface InfoSheetProps {
  visible: boolean;
  infoKey: InfoKey;
  dynamic?: InfoDynamic;
  onClose: () => void;
}

export function InfoSheet({ visible, infoKey, dynamic, onClose }: InfoSheetProps): React.JSX.Element {
  const t = useT() as Translate;
  const { colors, pairing } = useTheme();
  const insets = useScreenInsets();
  const headingRef = useRef<React.ComponentRef<typeof Text>>(null);
  const copy = infoCopy(infoKey, dynamic);
  const term = refText(t, copy.term);
  const reason = copy.reason ? refText(t, copy.reason) : undefined;

  useEffect(() => {
    if (!visible) return undefined;
    const timer = setTimeout(() => focusAccessibility(headingRef.current), 0);
    return () => clearTimeout(timer);
  }, [visible]);

  return (
    <Sheet visible={visible} onDismiss={onClose} accessibilityLabel={t('decide.infoButton.a11y', { term })} dirty={false}>
      {/* the sheet mounts inside a possibly read-only check; its own Close must stay live */}
      <ReadOnlyScope.Provider value={false}>
        <View style={[styles.content, { paddingBottom: space.sheetPadBottom + insets.bottom }]}>
          <Text ref={headingRef} accessibilityRole="header" style={{ ...textRole(pairing, 'sheetTitle'), color: colors.ink }}>
            {term}
          </Text>
          {copy.body.map((b, i) => (
            <Text key={`${b.key}-${i}`} style={{ ...textRole(pairing, 'body'), color: colors.inkDim }}>
              {refText(t, reason && i === copy.body.length - 1 ? { ...b, params: { ...(b.params ?? {}), reason } } : b)}
            </Text>
          ))}
          <View style={[styles.tile, { backgroundColor: colors.fill1 }]}>
            <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.eyebrow, color: colors.inkMuted }}>
              {t('decide.infoButton.sheetChanges')}
            </Text>
            <Text style={{ ...textRole(pairing, 'body'), fontSize: fontSize.s13_5, color: colors.ink }}>
              {refText(t, copy.changes)}
            </Text>
          </View>
          <Pill label={t('decide.infoButton.close')} variant="secondary" onPress={onClose} />
        </View>
      </ReadOnlyScope.Provider>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: space.sheetCornerPad, gap: space.gapMd },
  tile: { borderRadius: 16, padding: space.cardPad, gap: 4 },
});
