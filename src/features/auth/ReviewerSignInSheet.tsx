// 10-25 (ACC-11, D-26, D-30): the store-review sign-in sheet, opened from the visible "App review sign-in" link.
// Email and password; every refusal shows the same line (D-25). The password is never logged or kept after the call.
import React, { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '@/ui/Text';
import { TextInput } from '@/ui/TextInput';
import { Sheet } from '@/ui/Sheet';
import { Pill } from '@/ui/Pill';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, space } from '@/theme/layout';
import { textRole } from '@/theme/typography';
import { reviewerSignIn } from '@/services/auth/reviewerSignIn';

export interface ReviewerSignInSheetProps {
  visible: boolean;
  onClose: () => void;
}

export function ReviewerSignInSheet({ visible, onClose }: ReviewerSignInSheetProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  // Fields are cleared on every close, so the password never outlives the sheet.
  const close = useCallback(() => {
    setEmail('');
    setPassword('');
    setFailed(false);
    setBusy(false);
    onClose();
  }, [onClose]);

  const submit = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    const result = await reviewerSignIn(email, password);
    setBusy(false);
    if (result === 'ok') {
      close();
    } else {
      setFailed(true);
    }
  }, [busy, email, password, close]);

  const fieldStyle = [styles.input, { ...textRole(pairing, 'body'), color: colors.ink, backgroundColor: colors.fill6 }];

  return (
    <Sheet visible={visible} onDismiss={close}>
      <View style={styles.column}>
        <Text accessibilityRole="header" style={{ ...textRole(pairing, 'sheetTitle'), color: colors.ink }}>
          {t('system.reviewer.title')}
        </Text>
        <View style={styles.field}>
          <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>{t('system.reviewer.email')}</Text>
          <TextInput
            testID="reviewer-email"
            value={email}
            onChangeText={setEmail}
            accessibilityLabel={t('system.reviewer.email')}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            textContentType="username"
            autoComplete="email"
            returnKeyType="next"
            maxLength={254}
            style={fieldStyle}
          />
        </View>
        <View style={styles.field}>
          <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>{t('system.reviewer.password')}</Text>
          <TextInput
            testID="reviewer-password"
            value={password}
            onChangeText={setPassword}
            accessibilityLabel={t('system.reviewer.password')}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            textContentType="password"
            autoComplete="password"
            returnKeyType="go"
            onSubmitEditing={() => {
              void submit();
            }}
            maxLength={200}
            style={fieldStyle}
          />
        </View>
        {failed ? (
          <Text accessibilityRole="alert" style={{ ...textRole(pairing, 'label'), color: colors.danger }}>
            {t('system.reviewer.failed')}
          </Text>
        ) : null}
        <View style={styles.actions}>
          <Pill label={t('system.reviewer.cancel')} variant="secondary" onPress={close} />
          <Pill
            label={t('system.reviewer.submit')}
            variant="primary"
            pending={busy}
            disabled={email.trim() === '' || password === ''}
            onPress={() => {
              void submit();
            }}
          />
        </View>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  column: { gap: space.groupGap },
  field: { gap: space.gapSm },
  input: {
    minHeight: 52,
    borderRadius: radii.glyphTile,
    paddingHorizontal: space.gapMd,
  },
  actions: { flexDirection: 'row', gap: space.gapMd },
});
