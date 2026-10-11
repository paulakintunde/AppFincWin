// D-21: the password sheet for a protected PDF. The typed value lives only in the field (an
// uncontrolled TextInput) until Unlock hands it to the hook; it is then cleared. It is never
// logged or stored here.
import React, { useRef, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { useT } from '@/i18n';
import { Pill } from '@/ui/Pill';
import { Sheet, SheetScroll } from '@/ui/Sheet';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, space } from '@/theme/layout';
import { textRole } from '@/theme/typography';
import { Actions, Heading, T } from './importUi';

export interface PasswordPromptSheetProps {
  visible: boolean;
  wrong: boolean;
  onUnlock: (password: string) => void;
  onCancel: () => void;
}

export function PasswordPromptSheet({ visible, wrong, onUnlock, onCancel }: PasswordPromptSheetProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const typed = useRef('');
  const inputRef = useRef<TextInput>(null);
  const [hasText, setHasText] = useState(false);

  const wipe = () => {
    typed.current = '';
    inputRef.current?.clear();
    setHasText(false);
  };
  const unlock = () => {
    const value = typed.current;
    if (value.length === 0) return;
    wipe();
    onUnlock(value);
  };
  const cancel = () => {
    wipe();
    onCancel();
  };

  return (
    <Sheet visible={visible} onDismiss={cancel} accessibilityLabel={t('importCsv.pdf.passwordHeading')}>
      <SheetScroll>
        <Heading>{t('importCsv.pdf.passwordHeading')}</Heading>
        <T>{t('importCsv.pdf.passwordBody')}</T>
        <TextInput
          ref={inputRef}
          secureTextEntry
          autoFocus
          autoCorrect={false}
          autoCapitalize="none"
          textContentType="password"
          accessibilityLabel={t('importCsv.pdf.passwordLabel')}
          onChangeText={(v) => {
            typed.current = v;
            setHasText(v.length > 0);
          }}
          onSubmitEditing={unlock}
          style={[
            textRole(pairing, 'body'),
            styles.field,
            { backgroundColor: colors.fill1, color: colors.ink, borderRadius: radii.card / 2, borderColor: colors.inkFaint },
          ]}
        />
        {wrong ? (
          <View accessibilityLiveRegion="polite">
            <T tone="danger">{t('importCsv.pdf.passwordWrong')}</T>
          </View>
        ) : null}
        <Actions>
          <Pill label={t('importCsv.pdf.unlock')} variant="primary" disabled={!hasText} onPress={unlock} />
          <Pill label={t('importCsv.cancel')} variant="secondary" onPress={cancel} />
        </Actions>
      </SheetScroll>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  field: { minHeight: space.touchMin, paddingHorizontal: space.gapMd, borderWidth: 1, marginVertical: space.gapMd },
});
