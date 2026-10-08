// REC-07, D-34, D-35: create a category, or rename/recolour an existing one (built-ins
// included). Colour comes only from the 7 fixed swatch pairs. Every write records its own
// undo step and shows the Undo toast (REC-11). Removal goes through RemoveCategoryPrompt
// (merge or archive, never delete, D-36).
import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { CATEGORY_COLOR_KEYS, type CategoryColorKey } from '@/engine/categorize';
import type { CategoryRow } from '@/db/rows';
import { useAddCategory, useEditCategory } from '@/data/mutations/categories';
import { useRecordContext } from '@/features/record/useRecordContext';
import { categoryName } from '@/features/record/categoryName';
import { useT } from '@/i18n';
import { undoLabelText } from '@/i18n/undoLabel';
import { showToast } from '@/state/undoToast';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, space } from '@/theme/layout';
import { textRole } from '@/theme/typography';
import { CategoryGlyph } from '@/ui/CategoryGlyph';
import { Pill } from '@/ui/Pill';
import { Sheet } from '@/ui/Sheet';
import { SheetHeader } from '@/ui/SheetHeader';
import { SwatchDot } from '@/ui/SwatchDot';
import { RemoveCategoryPrompt } from './RemoveCategoryPrompt';

export type CategorySheetMode = { kind: 'new' } | { kind: 'edit'; category: CategoryRow };

export interface CategorySheetProps {
  visible: boolean;
  mode: CategorySheetMode;
  onClose: () => void;
}

const NAME_MAX = 60;

export function CategorySheet({ visible, mode, onClose }: CategorySheetProps) {
  if (!visible) return null;
  return <SheetBody mode={mode} onClose={onClose} />;
}

function SheetBody({ mode, onClose }: { mode: CategorySheetMode; onClose: () => void }) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const rc = useRecordContext();
  const { add } = useAddCategory();
  const { edit } = useEditCategory();
  const editing = mode.kind === 'edit' ? mode.category : null;
  const initialName = editing ? categoryName(editing, t) : '';
  const [name, setName] = useState(initialName);
  const [colorKey, setColorKey] = useState<CategoryColorKey>(editing?.color_key ?? CATEGORY_COLOR_KEYS[0]);
  const [submitted, setSubmitted] = useState(false);
  const [removing, setRemoving] = useState(false);

  const trimmed = name.trim();
  const nameMissing = trimmed.length < 1 || trimmed.length > NAME_MAX;
  const title = editing ? t('categories.sheet.titleEdit') : t('categories.sheet.titleNew');

  const save = () => {
    setSubmitted(true);
    if (nameMissing || !rc.userId) return;
    if (!editing) {
      const { stepId } = add({ ownerId: rc.userId, name: trimmed, colorKey });
      showToast({ kind: 'ordinary', text: undoLabelText('categoryAdded', { name: trimmed }), stepId });
      onClose();
      return;
    }
    const patch: { name?: string; colorKey?: CategoryColorKey } = {};
    if (trimmed !== initialName) patch.name = trimmed;
    if (colorKey !== editing.color_key) patch.colorKey = colorKey;
    if (Object.keys(patch).length === 0) {
      onClose();
      return;
    }
    const stepId = edit(editing, patch);
    showToast({ kind: 'ordinary', text: undoLabelText('categoryEdited', { name: trimmed }), stepId });
    onClose();
  };

  const inputStyle = [
    textRole(pairing, 'body'),
    styles.input,
    { backgroundColor: colors.fill1, color: colors.ink, borderRadius: radii.card / 2 },
  ];
  const labelStyle = { ...textRole(pairing, 'label'), color: colors.inkMuted };
  const errorStyle = { ...textRole(pairing, 'label'), color: colors.danger };

  return (
    <Sheet visible onDismiss={onClose} accessibilityLabel={title}>
      <SheetHeader title={title} cancelLabel={t('record.sheet.cancel')} onCancel={onClose} />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.column}>
        <View style={styles.previewRow}>
          <CategoryGlyph colorKey={colorKey} letter={(trimmed.charAt(0) || '?').toUpperCase()} />
        </View>
        <Text style={labelStyle}>{t('categories.sheet.name')}</Text>
        <TextInput
          accessibilityLabel={t('categories.sheet.name')}
          value={name}
          onChangeText={setName}
          maxLength={NAME_MAX}
          style={inputStyle}
          placeholderTextColor={colors.inkFaint}
        />
        {submitted && nameMissing ? <Text style={errorStyle}>{t('categories.sheet.nameRequired')}</Text> : null}
        <Text style={labelStyle}>{t('categories.sheet.colour')}</Text>
        <View style={styles.swatches}>
          {CATEGORY_COLOR_KEYS.map((key) => (
            <SwatchDot key={key} colorKey={key} selected={key === colorKey} onPress={() => setColorKey(key)} />
          ))}
        </View>
        <Pill label={editing ? t('categories.sheet.saveChanges') : t('categories.sheet.save')} variant="primary" onPress={save} />
        {editing ? (
          <Pill label={t('categories.sheet.archive')} variant="danger" onPress={() => setRemoving(true)} />
        ) : null}
      </ScrollView>
      {editing ? (
        <RemoveCategoryPrompt
          visible={removing}
          category={editing}
          onCancel={() => setRemoving(false)}
          onDone={() => {
            setRemoving(false);
            onClose();
          }}
        />
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  column: {
    gap: space.gapSm,
    paddingBottom: space.gapMd,
  },
  previewRow: {
    flexDirection: 'row',
  },
  swatches: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  input: {
    minHeight: space.touchMin,
    paddingHorizontal: space.cardPad,
    paddingVertical: space.gapSm,
  },
});
