// 05.3-24 (DSV-05, DSV-13, D-13, D-16, D-19): Check a purchase. The core: item and price, band chip, item type, how-pay, an
// autosaving draft, validation and "Check it". Layer cards plug into `renderLayers` (05.3-40, 05.3-42). The draft saves as you
// type; the stored answer (answer_v3) is written only when "Check it" is pressed.
import React, { useEffect, useMemo, useRef } from 'react';
import { AccessibilityInfo, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useCheckV3 } from '@/data/queries/decideCheckV3';
import type { CheckV2, Evaluation, ItemTypeRef, Layer } from '@/engine/decide/v3';
import { toStoredV2 } from '@/engine/decide/v3';
import { useRecordContext } from '@/features/record/useRecordContext';
import { useLooseT } from './useLooseT';
import { DetailHeader } from '@/shell/header/DetailHeader';
import { useScreenTitleFocus } from '@/shell/a11yFocus';
import { replaceOnce } from '@/shell/navigation/pushOnce';
import { space, useScreenInsets } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { fontSize, textRole } from '@/theme/typography';
import { Pill } from '@/ui/Pill';
import { Text } from '@/ui/Text';
import { priceProblem } from '../model/draftStatus';
import { withItemType, withPayMode, withPrice } from '../model/checkEdits';
import { revealedLayers } from '../model/layerVisibility';
import { answerHref } from '../nav/hrefs';
import { BandChip } from './BandChip';
import { ItemPriceFields } from './ItemPriceFields';
import { ItemTypeChips } from './ItemTypeChips';
import { PayToggle } from './PayToggle';
import { useV3CheckDraft } from './useV3CheckDraft';

export interface CheckScreenProps {
  id: string;
  focus: 'price' | null;
  /** Rendered between the pay toggle and the reassurance tile (05.3-40 fills it). */
  renderLayers?: (args: { check: CheckV2; evaluation: Evaluation | null; edit(next: CheckV2): void }) => React.ReactNode;
}

const NO_LAYERS: readonly Layer[] = [];
const CHECK_PATH = 'M3.5 8.5l3 3 6-7';
const GLYPH = 16;

function cap(s: string): string {
  return s.length === 0 ? s : s.charAt(0).toUpperCase() + s.slice(1);
}

export function CheckScreen({ id, focus, renderLayers }: CheckScreenProps): React.JSX.Element {
  const t = useLooseT();
  const { colors, pairing } = useTheme();
  const insets = useScreenInsets();
  const rc = useRecordContext();
  const draft = useV3CheckDraft(id);
  const { check, edit, readOnly } = draft;

  const titleRef = useRef<React.ComponentRef<typeof Text>>(null);
  useScreenTitleFocus(titleRef as never);

  // The live answer of the draft: the stored inputs of what is typed now (memoised so a render without an edit does not recompute).
  const stored = useMemo(() => toStoredV2(check), [check]);
  const live = useCheckV3(id, { inputs: stored });
  const evaluation = live.evaluation;
  const band = evaluation?.purchase?.band ?? evaluation?.result.band ?? null;
  const layers = evaluation?.purchase?.layers ?? evaluation?.result.layers ?? NO_LAYERS;

  // A new layer appearing is announced politely, once.
  const prevLayers = useRef<readonly Layer[]>(layers);
  useEffect(() => {
    const added = revealedLayers(prevLayers.current, layers).filter((l) => l !== 'L1e');
    prevLayers.current = layers;
    if (added.length === 0) return;
    const word = cap(t(`decide.v3.ui.band.layer.${added[0]}`));
    AccessibilityInfo.announceForAccessibility(t('decide.v3.ui.check.revealed', { layer: word }));
  }, [layers, t]);

  // Only the two bad transitions of the save status are announced (05 R7); the visible text is not a live region.
  const prevStatus = useRef(draft.status);
  useEffect(() => {
    if (prevStatus.current === draft.status) return;
    prevStatus.current = draft.status;
    if (draft.status === 'offline') AccessibilityInfo.announceForAccessibility(t('decide.v3.ui.check.offline'));
    else if (draft.status === 'notSaved') AccessibilityInfo.announceForAccessibility(t('decide.v3.ui.check.notSaved'));
  }, [draft.status, t]);

  const problem = priceProblem(check.price);
  const disabled = problem !== null || evaluation === null || readOnly;
  const reason = problem === 'priceNeeded' ? t('decide.v3.ui.check.priceNeeded') : null;

  const ready =
    evaluation !== null &&
    evaluation.result.readiness?.ready !== false &&
    !evaluation.result.confidence.reasons.includes('no_setup');

  const onCheck = (): void => {
    if (disabled || evaluation === null) return;
    if (draft.commit(evaluation.result)) replaceOnce(answerHref(id));
  };

  const statusText = t(`decide.v3.ui.check.${draft.status}`);

  return (
    <KeyboardAvoidingView style={[styles.root, { backgroundColor: colors.canvas }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <DetailHeader
        title={t('decide.v3.ui.check.header')}
        right={<Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkMuted }}>{statusText}</Text>}
      />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.body, { paddingHorizontal: space.screenH, paddingTop: space.groupGap, paddingBottom: space.groupGap }]}
      >
        <Text ref={titleRef} accessibilityRole="header" style={{ ...textRole(pairing, 'heading'), color: colors.ink }}>
          {t('decide.v3.ui.check.title')}
        </Text>
        <ItemPriceFields
          name={draft.name}
          onName={draft.setName}
          price={check.price}
          onPrice={(minor) => edit(withPrice(check, minor === null ? null : (minor as never)))}
          currency={rc.homeCurrency}
          focusPrice={focus === 'price'}
          readOnly={readOnly}
        />
        {live.inputs === null ? null : <BandChip band={band} thresholds={live.inputs.thresholds} layers={layers} />}
        <ItemTypeChips selected={check.itemType} onSelect={(ref: ItemTypeRef) => edit(withItemType(check, ref))} readOnly={readOnly} />
        <PayToggle mode={check.pay.mode} onChange={(mode) => edit(withPayMode(check, mode))} readOnly={readOnly} />
        {renderLayers === undefined ? null : renderLayers({ check, evaluation, edit })}
        {ready ? (
          <View testID="reassure-tile" style={[styles.tile, { backgroundColor: colors.accentTint3, borderColor: colors.accentTint1 }]}>
            <Svg width={GLYPH} height={GLYPH} viewBox="0 0 16 16" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              <Path d={CHECK_PATH} stroke={colors.accent} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
            <View style={styles.tileText}>
              <Text style={{ ...textRole(pairing, 'body'), fontSize: fontSize.meta, color: colors.ink }}>{t('decide.v3.ui.check.reassure')}</Text>
              <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkMuted }}>{t('decide.v3.ui.check.updatedToday')}</Text>
            </View>
          </View>
        ) : null}
      </ScrollView>
      <View style={[styles.bar, { borderTopColor: colors.line1, backgroundColor: colors.canvas, paddingBottom: insets.bottom + space.gapMd }]}>
        {reason === null ? null : (
          <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkMuted }}>{reason}</Text>
        )}
        <Pill
          variant="primary"
          label={t('decide.v3.ui.check.cta')}
          disabled={disabled}
          onPress={onCheck}
          accessibilityHint={reason ?? undefined}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  body: { gap: space.groupGap },
  tile: { flexDirection: 'row', gap: space.gapMd, borderRadius: space.cardPad, borderWidth: 1, padding: space.cardPad, alignItems: 'flex-start' },
  tileText: { flex: 1, flexShrink: 1, gap: 2 },
  bar: { borderTopWidth: 1, paddingTop: space.gapMd, paddingHorizontal: space.screenH, gap: space.gapSm },
});
