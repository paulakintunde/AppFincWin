// 05.3-84 (UAT step 75 item 2, 05.1 D-19): manage the user's own kinds of purchase and purposes. Rename, change what a kind
// counts like, or remove. Removing never changes a recorded decision: the entry stays stored as removed, so a check that
// used it still shows its name, and an open check that used it is judged as General.
import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { V3PresetItemType } from '@/engine/decide/v3';
import { PRESSED_OPACITY, space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { fontSize, textRole } from '@/theme/typography';
import { ConfirmSheet } from '@/ui/ConfirmSheet';
import { Pill } from '@/ui/Pill';
import { Sheet, SheetScroll } from '@/ui/Sheet';
import { SheetHeader } from '@/ui/SheetHeader';
import { Text } from '@/ui/Text';
import { OwnOptionSheet, type OwnSaveOutcome } from './OwnOptionSheet';
import { useLooseT } from './useLooseT';
import { useOwnOptions } from './useOwnOptions';

type Mode = 'itemType' | 'purpose';

export interface OwnOptionsListSheetProps {
  visible: boolean;
  mode: Mode;
  onClose(): void;
}

interface Row {
  id: string;
  name: string;
  base?: V3PresetItemType;
}

const P = 'decide.v3.ui.ownOptions.';

export function OwnOptionsListSheet({ visible, mode, onClose }: OwnOptionsListSheetProps): React.JSX.Element {
  const t = useLooseT();
  const { colors, pairing } = useTheme();
  const own = useOwnOptions();
  const [renaming, setRenaming] = useState<Row | null>(null);
  const [removing, setRemoving] = useState<Row | null>(null);
  const item = mode === 'itemType';
  const rows: readonly Row[] = item ? own.itemRows : own.purposes.map((p) => ({ id: p.id, name: p.label }));
  const title = t(item ? `${P}listTitleItem` : `${P}listTitlePurpose`);

  const saveRename = (input: { name: string; base?: V3PresetItemType }): OwnSaveOutcome => {
    const target = renaming as Row;
    const r = own.rename(mode, target.id, input.name, input.base);
    if (!r.ok) return r.reason === 'too_many' ? 'name_length' : r.reason;
    setRenaming(null);
    return 'ok';
  };
  const confirmRemove = (): void => {
    const target = removing as Row;
    own.remove(mode, target.id);
    setRemoving(null);
    onClose();
  };

  return (
    <>
      <Sheet visible={visible} onDismiss={onClose} accessibilityLabel={title}>
        <SheetHeader title={title} cancelLabel={t(`${P}close`)} onCancel={onClose} />
        <SheetScroll>
          <View style={styles.list}>
            {rows.map((r) => (
              <View key={r.id} style={styles.row}>
                <Text style={{ ...textRole(pairing, 'body'), color: colors.ink }}>{r.name}</Text>
                {item && r.base !== undefined ? (
                  <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkDim }}>
                    {t(`${P}countsLikeRow`, { kind: t(`decide.v3.ui.check.itemType.${r.base}`) })}
                  </Text>
                ) : null}
                <View style={styles.actions}>
                  <Pill label={t(`${P}rename`)} variant="secondary" accessibilityLabel={t(`${P}renameA11y`, { name: r.name })} onPress={() => setRenaming(r)} />
                  <Pill label={t(`${P}remove`)} variant="danger" accessibilityLabel={t(`${P}removeA11y`, { name: r.name })} onPress={() => setRemoving(r)} />
                </View>
              </View>
            ))}
          </View>
        </SheetScroll>
      </Sheet>
      {renaming === null ? null : (
        <OwnOptionSheet
          key={renaming.id}
          visible
          mode={mode}
          title={t(item ? `${P}renameItemTitle` : `${P}renamePurposeTitle`)}
          initial={{ name: renaming.name, base: renaming.base }}
          onCancel={() => setRenaming(null)}
          onSave={saveRename}
        />
      )}
      <ConfirmSheet
        visible={removing !== null}
        title={t(`${P}removeTitle`, { name: removing?.name ?? '' })}
        body={t(`${P}removeBody`)}
        cancelLabel={t(`${P}keep`)}
        confirmLabel={t(`${P}removeConfirm`)}
        destructive
        onConfirm={confirmRemove}
        onCancel={() => setRemoving(null)}
      />
    </>
  );
}

export interface EditOwnLinkProps {
  mode: Mode;
}

/** The quiet 'Edit your own' link and its list sheet. Shows only when at least one own option of this kind exists. */
export function EditOwnLink({ mode }: EditOwnLinkProps): React.JSX.Element | null {
  const t = useLooseT();
  const { colors, pairing } = useTheme();
  const own = useOwnOptions();
  const [open, setOpen] = useState(false);
  const count = mode === 'itemType' ? own.liveCount.itemTypes : own.liveCount.purposes;
  if (count === 0) return null;
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t(`${P}editLink`)}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.link, { opacity: pressed ? PRESSED_OPACITY : 1 }]}
      >
        <Text style={{ ...textRole(pairing, 'label'), color: colors.inkDim, textDecorationLine: 'underline' }}>{t(`${P}editLink`)}</Text>
      </Pressable>
      <OwnOptionsListSheet visible={open} mode={mode} onClose={() => setOpen(false)} />
    </>
  );
}

const styles = StyleSheet.create({
  list: { gap: space.gapSm },
  row: { borderRadius: space.gapSm, paddingVertical: space.gapSm, gap: space.gapSm },
  actions: { flexDirection: 'row', gap: space.gapSm },
  link: { minHeight: space.touchMin, justifyContent: 'center', alignSelf: 'flex-start' },
});
