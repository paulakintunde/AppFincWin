// REC-07, D-34, D-35: create a category, or rename/recolour an existing one (built-ins
// included). Colour comes only from the 7 fixed swatch pairs. Every write records its own
// undo step and shows the Undo toast (REC-11). Removal goes through RemoveCategoryPrompt
// (merge or archive, never delete, D-36).
// 06.2-19 (D-07): a custom category picks its icon from our own set (CategoryIconPicker) and saves it as icon_key
// (null = the letter). A built-in keeps its drawn icon, so the Icon row is not offered for one.
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '@/ui/Text';
import { TextInput } from '@/ui/TextInput';
import { CATEGORY_COLOR_KEYS, type CategoryColorKey } from '@/engine/categorize';
import type { CategoryRow } from '@/db/rows';
import { useAddCategory, useEditCategory } from '@/data/mutations/categories';
import { useRecordContext } from '@/features/record/useRecordContext';
import { categoryName } from '@/features/record/categoryName';
import { useT } from '@/i18n';
import { useAmountParser } from '@/ui/money/useAmountParser';
import { undoLabelText } from '@/i18n/undoLabel';
import { showToast } from '@/state/undoToast';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, space } from '@/theme/layout';
import { textRole } from '@/theme/typography';
import { CategoryGlyph } from '@/ui/CategoryGlyph';
import { iconForCategory } from '@/ui/icons/iconFor';
import type { IconName } from '@/ui/icons/iconData';
import { Row } from '@/ui/Row';
import { Pill } from '@/ui/Pill';
import { Sheet, SheetScroll } from '@/ui/Sheet';
import { useIsDirty } from '@/ui/useIsDirty';
import { SheetHeader } from '@/ui/SheetHeader';
import { SwatchDot } from '@/ui/SwatchDot';
import { RemoveCategoryPrompt } from './RemoveCategoryPrompt';
import { CategoryIconPicker, useIconWord } from './CategoryIconPicker';

export type CategorySheetMode = { kind: 'new' } | { kind: 'edit'; category: CategoryRow };

export interface CategorySheetProps {
  visible: boolean;
  mode: CategorySheetMode;
  onClose: () => void;
}

const NAME_MAX = 60;
const CAP_MAX = 10_000_000_000_000;

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
  const parser = useAmountParser(rc.region);
  const [capText, setCapText] = useState(
    editing && editing.monthly_cap !== null ? parser.toInputText(editing.monthly_cap, rc.homeCurrency) : ''
  );
  const showCap = !editing?.is_system;
  // A built-in (seed or system) category keeps its drawn icon; only a custom one picks.
  const showIcon = editing === null || (editing.builtin_key === null && !editing.is_system);
  // Only an icon_key that names one of our icons counts; anything else reads as the letter.
  const initialIcon = editing ? iconForCategory({ icon_key: editing.icon_key ?? null }) : null;
  const [iconKey, setIconKey] = useState<IconName | null>(initialIcon);
  const [pickingIcon, setPickingIcon] = useState(false);
  const iconWord = useIconWord();
  const capRaw = capText.trim() === '' ? null : parser.parse(capText, rc.homeCurrency);
  // The DB check is 1..10^13 minor units, so a zero or out-of-range cap is refused here too.
  const capParsed =
    capRaw && capRaw.ok && (capRaw.value < 1 || capRaw.value > CAP_MAX)
      ? ({ ok: false, error: capRaw.value < 1 ? 'invalid' : 'too-large', maxDecimals: 2 } as const)
      : capRaw;
  const capFailure = capParsed && !capParsed.ok ? capParsed : null;
  const capMinor = capParsed && capParsed.ok ? capParsed.value : null;
  const [submitted, setSubmitted] = useState(false);
  const [removing, setRemoving] = useState(false);
  // D-26: unsaved work = any field differs from what the sheet opened with.
  const [initial] = useState(() => ({ name, colorKey, capText, iconKey }));
  const dirty = useIsDirty(initial, { name, colorKey, capText, iconKey });

  const trimmed = name.trim();
  const letter = (trimmed.charAt(0) || '?').toUpperCase();
  const nameMissing = trimmed.length < 1 || trimmed.length > NAME_MAX;
  const title = editing ? t('categories.sheet.titleEdit') : t('categories.sheet.titleNew');

  const save = () => {
    setSubmitted(true);
    if (nameMissing || !rc.userId) return;
    if (showCap && capFailure) return;
    if (!editing) {
      const { stepId } = add({
        ownerId: rc.userId,
        name: trimmed,
        colorKey,
        ...(showCap && capMinor !== null ? { monthlyCap: capMinor } : {}),
        ...(iconKey !== null ? { iconKey } : {}),
      });
      showToast({ kind: 'ordinary', text: undoLabelText('categoryAdded', { name: trimmed }), stepId });
      onClose();
      return;
    }
    const patch: { name?: string; colorKey?: CategoryColorKey; monthlyCap?: number | null; iconKey?: string | null } = {};
    if (trimmed !== initialName) patch.name = trimmed;
    if (colorKey !== editing.color_key) patch.colorKey = colorKey;
    if (showCap && capMinor !== editing.monthly_cap) patch.monthlyCap = capMinor;
    if (showIcon && iconKey !== initialIcon) patch.iconKey = iconKey;
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
    <Sheet visible onDismiss={onClose} accessibilityLabel={title} dirty={dirty}>
      <SheetHeader title={title} cancelLabel={t('record.sheet.cancel')} onCancel={onClose} />
      <SheetScroll contentContainerStyle={styles.column}>
        <View style={styles.previewRow}>
          <CategoryGlyph
            colorKey={colorKey}
            icon={showIcon ? iconKey : iconForCategory(editing)}
            letter={letter}
            size={48}
          />
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
        {showIcon ? (
          <Row
            label={t('appLife.categories.iconLabel')}
            value={iconWord(iconKey)}
            leading={<CategoryGlyph colorKey={colorKey} icon={iconKey} letter={letter} />}
            chevron
            onPress={() => setPickingIcon(true)}
          />
        ) : null}
        {showCap ? (
          <>
            <Text style={labelStyle}>{t('categories.cap.label')}</Text>
            <TextInput
              accessibilityLabel={t('categories.cap.label')}
              value={capText}
              onChangeText={setCapText}
              keyboardType="decimal-pad"
              style={inputStyle}
              placeholderTextColor={colors.inkFaint}
            />
            {capFailure ? (
              <Text style={errorStyle}>{parser.errorMessage(capFailure)}</Text>
            ) : (
              <Text style={labelStyle}>{t('categories.cap.helper')}</Text>
            )}
          </>
        ) : null}
        <Pill label={editing ? t('categories.sheet.saveChanges') : t('categories.sheet.save')} variant="primary" onPress={save} />
        {editing ? (
          <Pill label={t('categories.sheet.archive')} variant="danger" onPress={() => setRemoving(true)} />
        ) : null}
      </SheetScroll>
      {showIcon ? (
        <CategoryIconPicker
          visible={pickingIcon}
          colorKey={colorKey}
          letter={letter}
          selected={iconKey}
          onPick={(icon) => {
            setIconKey(icon);
            setPickingIcon(false);
          }}
          onClose={() => setPickingIcon(false)}
        />
      ) : null}
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
