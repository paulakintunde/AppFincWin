/**
 * UI-SPEC Design System: the shared modal bottom sheet container every Record sheet
 * (entry, category, account, import) is built on. Phase 3 (NAV-03) swaps internals for
 * @gorhom/bottom-sheet with drag-to-dismiss; props stay the same.
 */
import React, { type ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, space, useScreenInsets } from '@/theme/layout';

export interface SheetProps {
  visible: boolean;
  onDismiss: () => void;
  children: ReactNode;
  accessibilityLabel?: string;
}

export function Sheet({ visible, onDismiss, children, accessibilityLabel }: SheetProps) {
  const t = useT();
  const { colors } = useTheme();
  const insets = useScreenInsets();
  const { height } = useWindowDimensions();

  if (!visible) {
    return null;
  }

  return (
    <Modal transparent visible={visible} animationType="slide" onRequestClose={onDismiss}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable
          style={styles.backdrop}
          accessibilityRole="button"
          accessibilityLabel={t('a11y.close')}
          onPress={onDismiss}
        />
        <View
          testID="sheet-container"
          accessibilityLabel={accessibilityLabel}
          style={[
            styles.container,
            {
              // S-CR-05: never taller than the screen below the status bar, so the header
              // (title and Cancel) is always reachable; the body scrolls in a SheetScroll.
              maxHeight: height - insets.top - space.groupGap,
              backgroundColor: colors.surface,
              borderTopLeftRadius: radii.sheetTop,
              borderTopRightRadius: radii.sheetTop,
              paddingHorizontal: space.sheetCornerPad,
              paddingTop: space.sheetCornerPad,
              paddingBottom: space.sheetPadBottom + insets.bottom,
            },
          ]}
        >
          {children}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export interface SheetScrollProps {
  children: ReactNode;
  contentContainerStyle?: StyleProp<ViewStyle>;
}

/**
 * S-CR-05: the scrollable body of a sheet. Placed after the SheetHeader, it shrinks to the
 * space the capped container leaves, so a long list scrolls while the header stays put.
 */
export function SheetScroll({ children, contentContainerStyle }: SheetScrollProps) {
  return (
    <ScrollView
      testID="sheet-scroll"
      style={styles.scroll}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={contentContainerStyle}
    >
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flexShrink: 1,
  },
  flex: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
  },
  container: {
    width: '100%',
    flexShrink: 1,
  },
});
