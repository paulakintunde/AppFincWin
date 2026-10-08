/**
 * UI-SPEC Design System: the shared modal bottom sheet container every Record sheet
 * (entry, category, account, import) is built on. Phase 3 (NAV-03) swaps internals for
 * @gorhom/bottom-sheet with drag-to-dismiss; props stay the same.
 */
import React, { type ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
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

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
  },
  container: {
    width: '100%',
  },
});
