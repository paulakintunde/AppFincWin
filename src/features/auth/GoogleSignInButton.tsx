// D-12: an outline pill following Google's branding guidelines (not the raw Google-supplied
// full button asset) -- border colour, radius and label match the prototype
// (FincWin United.dc.html line ~3200), with the official multicolour G mark at its brand
// proportions (see brand/GoogleMark.tsx).
import { Pressable, StyleSheet, Text } from 'react-native';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { space, radii } from '@/theme/layout';
import { GoogleMark } from './brand/GoogleMark';

export interface GoogleSignInButtonProps {
  /** True while any sign-in is in flight (T-00-17-04) -- disables both buttons, not just this one. */
  disabled?: boolean;
  onPress: () => void;
}

export function GoogleSignInButton({ disabled = false, onPress }: GoogleSignInButtonProps) {
  const t = useT();
  const { colors, fonts } = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.button,
        { borderColor: colors.line3, backgroundColor: colors.surface },
        disabled && styles.disabled,
      ]}
    >
      <GoogleMark size={18} />
      <Text style={[styles.label, { fontFamily: fonts.body[600], color: colors.ink }]}>
        {t('auth.google.cta')}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: space.touchMin,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderRadius: radii.pill,
    paddingVertical: 15,
    gap: space.gapSm,
  },
  disabled: {
    opacity: 0.4,
  },
  label: {
    fontSize: 14.5,
  },
});
