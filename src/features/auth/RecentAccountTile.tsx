// ACC-14 (D-19..D-22, D-29): one remembered-account tile on the signed-out screen. Provider-neutral
// -- the same component serves Google and Apple. Shows only name and email; never logged.
import type { Ref } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { space, radii } from '@/theme/layout';
import { fontSize } from '@/theme/typography';
import { GoogleMark } from './brand/GoogleMark';
import { AppleMark } from './brand/AppleMark';
import type { RememberedAccount } from './rememberedAccounts';

export interface RecentAccountTileProps {
  account: RememberedAccount;
  /** This tile is signing in. */
  busy: boolean;
  /** Any sign-in is in flight. */
  disabled: boolean;
  onPress: () => void;
  onRemove: () => void;
  /** For screen-reader focus management. */
  removeRef?: Ref<View>;
  tileRef?: Ref<View>;
}

export function RecentAccountTile({
  account,
  busy,
  disabled,
  onPress,
  onRemove,
  removeRef,
  tileRef,
}: RecentAccountTileProps) {
  const t = useT();
  const { colors, fonts } = useTheme();
  const display = account.name ?? account.email;
  const providerLabel = t(
    account.provider === 'apple' ? 'auth.provider.apple' : 'auth.provider.google',
  );

  return (
    <View
      style={[
        styles.tile,
        { backgroundColor: colors.surface, borderColor: colors.line3 },
        disabled && styles.disabled,
      ]}
    >
      <Pressable
        ref={tileRef}
        accessibilityRole="button"
        accessibilityLabel={t('auth.welcome.tileA11y', {
          name: display,
          email: account.email,
          provider: providerLabel,
        })}
        accessibilityState={{ busy, disabled }}
        disabled={disabled}
        onPress={onPress}
        style={styles.row}
      >
        {busy ? (
          <ActivityIndicator color={colors.accent} />
        ) : account.provider === 'apple' ? (
          <AppleMark size={18} color={colors.ink} />
        ) : (
          <GoogleMark size={18} />
        )}
        <View style={styles.text}>
          <Text
            numberOfLines={1}
            style={[styles.name, { fontFamily: fonts.body[500], color: colors.ink }]}
          >
            {display}
          </Text>
          {account.name ? (
            <Text
              numberOfLines={1}
              ellipsizeMode="middle"
              style={[styles.email, { fontFamily: fonts.body[600], color: colors.inkMuted }]}
            >
              {account.email}
            </Text>
          ) : null}
        </View>
      </Pressable>
      <Pressable
        ref={removeRef}
        accessibilityRole="button"
        accessibilityLabel={t('auth.welcome.removeA11y', { name: display })}
        accessibilityState={{ disabled }}
        disabled={disabled}
        hitSlop={{ top: 14, bottom: 14, right: 24 }}
        onPress={onRemove}
        style={styles.remove}
      >
        <Text style={[styles.email, { fontFamily: fonts.body[600], color: colors.inkMuted }]}>
          {t('auth.welcome.remove')}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    borderWidth: 1.5,
    borderRadius: radii.card,
    paddingVertical: space.rowPad,
    paddingHorizontal: space.cardPad,
    minHeight: space.touchMin,
    gap: space.gapSm,
  },
  disabled: {
    opacity: 0.4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.gapMd,
    minHeight: space.touchMin - 2 * 0,
  },
  text: {
    flex: 1,
  },
  name: {
    fontSize: fontSize.body,
  },
  email: {
    fontSize: fontSize.label,
  },
  remove: {
    alignSelf: 'flex-start',
  },
});
