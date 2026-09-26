// D-11, D-12: on iOS this renders Apple's own native button (unmodified except corner
// radius, per Apple's HIG); on Android there is no native ASAuthorizationAppleIDButton, so
// FincWin draws its own HIG-compliant black pill using the same official Apple mark
// (Claude's Discretion / D-11 -- tapping it on Android runs Supabase's web OAuth flow, not
// a forced native ceremony; that routing lives in useAuth().signInWithApple, not here).
//
// A single outer Pressable owns accessibility/disabled/press handling on both platforms --
// the platform-specific visual underneath is wrapped with pointerEvents="none" so touches
// always resolve to this one control, keeping "disabled" and "in flight" behaviour identical
// regardless of which visual is showing.
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { space, radii } from '@/theme/layout';
import { fontSize } from '@/theme/typography';
import { AppleMark, APPLE_BUTTON_BLACK } from './brand/AppleMark';

export interface AppleSignInButtonProps {
  /** EXPO_PUBLIC_APPLE_SIGNIN_ENABLED -- false until Apple Developer Program enrolment clears. */
  enabled: boolean;
  /** True while any sign-in is in flight (T-00-17-04) -- disables both buttons, not just this one. */
  busy?: boolean;
  onPress: () => void;
}

const NATIVE_BUTTON_HEIGHT = 50;

export function AppleSignInButton({ enabled, busy = false, onPress }: AppleSignInButtonProps) {
  const t = useT();
  const { colors, fonts } = useTheme();
  const disabled = !enabled || busy;

  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={onPress}
        style={[styles.wrapper, disabled && styles.disabled]}
      >
        <View pointerEvents="none">
          {Platform.OS === 'ios' ? (
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
              buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
              cornerRadius={NATIVE_BUTTON_HEIGHT / 2}
              style={styles.nativeButton}
              onPress={onPress}
            />
          ) : (
            <View style={[styles.androidButton, { backgroundColor: APPLE_BUTTON_BLACK }]}>
              <AppleMark size={18} color={colors.surface} />
              <Text style={[styles.label, { fontFamily: fonts.body[600], color: colors.surface }]}>
                {t('auth.apple.cta')}
              </Text>
            </View>
          )}
        </View>
      </Pressable>
      {!enabled ? (
        <Text style={[styles.pendingNote, { fontFamily: fonts.body[600], color: colors.inkFaint }]}>
          {t('auth.apple.pendingEnrolment')}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    width: '100%',
  },
  disabled: {
    opacity: 0.4,
  },
  nativeButton: {
    height: NATIVE_BUTTON_HEIGHT,
    width: '100%',
  },
  androidButton: {
    height: NATIVE_BUTTON_HEIGHT,
    borderRadius: radii.pill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.gapSm,
  },
  label: {
    fontSize: fontSize.body,
  },
  pendingNote: {
    marginTop: space.gapSm,
    fontSize: fontSize.label,
    textAlign: 'center',
  },
});
