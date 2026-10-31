// 05.3-83: names one new kind of purchase or purpose. An own kind of purchase also asks which preset it counts like,
// and gets that preset's cost questions. Names are 1 to 40 trimmed characters (same rule as the model).
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { V3PresetItemType } from '@/engine/decide/v3';
import { space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { fontSize, textRole } from '@/theme/typography';
import { Chip } from '@/ui/Chip';
import { Pill } from '@/ui/Pill';
import { Sheet, SheetScroll } from '@/ui/Sheet';
import { SheetHeader } from '@/ui/SheetHeader';
import { Text } from '@/ui/Text';
import { TextInput } from '@/ui/TextInput';
import { OWN_NAME_MAX } from '../model/ownOptions';
import { ITEM_TYPE_ORDER } from '../model/checkOptions';
import { useLooseT } from './useLooseT';

export type OwnSaveOutcome = 'ok' | 'too_many' | 'name_taken' | 'name_length' | 'not_found';

export interface OwnOptionSheetProps {
  visible: boolean;
  mode: 'itemType' | 'purpose';
  onCancel(): void;
  onSave(input: { name: string; base?: V3PresetItemType }): OwnSaveOutcome;
}

const P = 'decide.v3.ui.ownOptions.';

export function OwnOptionSheet({ visible, mode, onCancel, onSave }: OwnOptionSheetProps): React.JSX.Element {
  const t = useLooseT();
  const { colors, pairing } = useTheme();
  const [name, setName] = useState('');
  const [base, setBase] = useState<V3PresetItemType>('general');
  const [refusal, setRefusal] = useState<OwnSaveOutcome | null>(null);
  const item = mode === 'itemType';
  const trimmed = name.trim();
  const valid = trimmed.length >= 1 && trimmed.length <= OWN_NAME_MAX;
  const title = t(item ? `${P}itemTitle` : `${P}purposeTitle`);
  const cancel = (): void => {
    setName('');
    setBase('general');
    setRefusal(null);
    onCancel();
  };
  const save = (): void => {
    if (!valid) return;
    const r = onSave(item ? { name: trimmed, base } : { name: trimmed });
    if (r === 'ok') {
      setName('');
      setBase('general');
      setRefusal(null);
    } else setRefusal(r);
  };
  const refusalText = refusal === null ? null : refusal === 'name_taken' ? t(`${P}nameTaken`) : refusal === 'too_many' ? t(`${P}tooMany`) : t(`${P}nameRange`);

  return (
    <Sheet visible={visible} onDismiss={cancel} accessibilityLabel={title}>
      <SheetHeader title={title} cancelLabel={t(`${P}cancel`)} onCancel={cancel} />
      <SheetScroll>
        <View style={styles.body}>
          <Text style={{ ...textRole(pairing, 'label'), color: colors.inkDim }}>{t(`${P}nameLabel`)}</Text>
          <TextInput
            value={name}
            onChangeText={(v) => {
              setName(v);
              setRefusal(null);
            }}
            maxLength={OWN_NAME_MAX}
            placeholder={t(item ? `${P}namePlaceholderItem` : `${P}namePlaceholderPurpose`)}
            placeholderTextColor={colors.inkMuted}
            accessibilityLabel={t(`${P}nameLabel`)}
            style={{ ...textRole(pairing, 'body'), color: colors.ink, backgroundColor: colors.fill1, borderRadius: space.gapSm, padding: space.gapMd }}
          />
          <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: valid || name.length === 0 ? colors.inkDim : colors.warn1 }}>
            {t(`${P}nameRange`)}
          </Text>
          {item ? (
            <View style={styles.body}>
              <Text accessibilityRole="header" style={{ ...textRole(pairing, 'label'), color: colors.inkDim }}>
                {t(`${P}countsLike`)}
              </Text>
              <View style={styles.wrap}>
                {ITEM_TYPE_ORDER.map((v) => (
                  <Chip key={v} label={t(`decide.v3.ui.check.itemType.${v}`)} selected={base === v} onPress={() => setBase(v)} />
                ))}
              </View>
              <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkDim }}>{t(`${P}countsLikeHint`)}</Text>
            </View>
          ) : null}
          {refusalText === null ? null : (
            <Text accessibilityLiveRegion="polite" style={{ ...textRole(pairing, 'label'), color: colors.warn1 }}>
              {refusalText}
            </Text>
          )}
          <Pill label={t(`${P}save`)} variant="primary" disabled={!valid} onPress={save} />
        </View>
      </SheetScroll>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: space.gapSm },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.gapSm },
});
