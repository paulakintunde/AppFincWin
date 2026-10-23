// 05-62 (D-73, R1): the shared delete pattern for saved Decide rows. A full swipe or the ⋯ menu's Delete only
// opens a confirm sheet; the caller's onDelete runs once, on the sheet's Delete, and owns the Undo toast.
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useT } from '@/i18n';
import { MoreGlyph } from '@/features/record/activity/header/HeaderGlyphs';
import { useTheme } from '@/theme/ThemeProvider';
import { ConfirmSheet } from '@/ui/ConfirmSheet';
import { Dropdown } from '@/ui/Dropdown';
import { SwipeRow } from '@/ui/SwipeRow';

export interface DeletableRowMenuItem {
  key: string;
  label: string;
  onSelect: () => void;
}

export interface DeletableRowProps {
  /** The row's name: titles the ⋯ menu and labels the trigger. */
  name: string;
  onOpen: () => void;
  /** The row's own options, listed above Delete. */
  menu: readonly DeletableRowMenuItem[];
  confirm: { title: string; body: string };
  onDelete: () => void;
  children: React.ReactNode;
  /** A read-only context: no ⋯, no swipe. */
  disabled?: boolean;
}

const DELETE_KEY = 'delete';

export function DeletableRow({ name, onOpen, menu, confirm, onDelete, children, disabled = false }: DeletableRowProps) {
  const t = useT();
  const { colors } = useTheme();
  const [confirming, setConfirming] = useState(false);
  const word = t('decide.delete.word');

  const options = [
    ...menu.map((m) => ({ key: m.key, label: m.label })),
    { key: DELETE_KEY, label: word, tone: 'danger' as const },
  ];

  const close = () => setConfirming(false);

  return (
    <>
      <SwipeRow
        right={{ word, a11yLabel: word, tone: 'danger', onCommit: () => setConfirming(true) }}
        disabled={disabled}
        onPress={onOpen}
      >
        <View style={styles.row}>
          <View style={styles.content}>{children}</View>
          {disabled ? null : (
            <Dropdown
              variant="glyph"
              glyph={<MoreGlyph color={colors.inkMuted} />}
              title={name}
              options={options}
              triggerA11yLabel={t('decide.delete.moreA11y', { name })}
              onSelect={(key) => {
                if (key === DELETE_KEY) setConfirming(true);
                else menu.find((m) => m.key === key)?.onSelect();
              }}
            />
          )}
        </View>
      </SwipeRow>
      <ConfirmSheet
        visible={confirming}
        title={confirm.title}
        body={confirm.body}
        destructive
        cancelLabel={t('decide.delete.keep')}
        confirmLabel={t('decide.delete.confirm')}
        onCancel={close}
        onDismiss={close}
        onConfirm={() => {
          close();
          onDelete();
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  content: { flex: 1 },
});
