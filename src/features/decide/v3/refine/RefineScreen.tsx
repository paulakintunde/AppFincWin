// 05.3-34 (DSV-14): the Refine Decide review screen. The card list is frozen when the screen first sees it, because opening
// stamps refine_last_at and refine() would then report nothing due; nothing changes until a button is pressed, a
// re-choice is allowed, and each update is its own Undo step.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import type { RefineCard as EngineRefineCard } from '@/engine/decide/v3';
import { useStampRefine } from '@/data/mutations/decideSetup';
import { useT } from '@/i18n';
import { useRecordContext } from '@/features/record/useRecordContext';
import { DetailScreen } from '@/shell/screen/DetailScreen';
import { space, useScreenInsets } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { textRole } from '@/theme/typography';
import { Pill } from '@/ui/Pill';
import { Text } from '@/ui/Text';
import { PotSheet } from '../../pots/PotSheet';
import { DebtSheetHost } from '../../setup/DebtSheet';
import { refineCards } from '../model/refineModel';
import { V3Skeleton } from '../nav/V3Skeleton';
import { RefineItemCard } from './RefineItemCard';
import { useRefine } from './useRefine';
import { cardKey } from './refineIntents';
import { useRefineChoices } from './useRefineChoices';

type Translate = (key: string, options?: Record<string, unknown>) => string;

export function RefineScreen(): React.JSX.Element {
  const t = useT() as unknown as Translate;
  const { colors, pairing } = useTheme();
  const insets = useScreenInsets();
  const rc = useRecordContext();
  const { result } = useRefine();
  const stamp = useStampRefine(rc.userId ?? '');
  const choices = useRefineChoices();
  const [frozen, setFrozen] = useState<readonly EngineRefineCard[] | null>(null);
  const stamped = useRef(false);

  if (frozen === null && result !== null && result.cards.length > 0) setFrozen(result.cards);

  // Opening stamps the "shown" time once, so the home card appears at most once a month (D-12).
  useEffect(() => {
    if (stamped.current || frozen === null) return;
    stamped.current = true;
    stamp.markShown(rc.today);
  }, [frozen, rc.today, stamp]);

  const models = useMemo(() => (frozen === null ? [] : refineCards(frozen)), [frozen]);
  if (frozen === null) {
    // Nothing due (or still loading): a skeleton while loading, otherwise a plain way back.
    return result === null ? <V3Skeleton /> : <DoneOnly />;
  }

  const n = models.length;
  const k = models.filter((m) => choices.decided.has(cardKey(m))).length;
  const K = 'decide.v3.ui.refine.';

  return (
    <DetailScreen title={t(`${K}header`, { k, n })} scroll={false}>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: space.groupGap }]}>
        <Text accessibilityRole="header" style={{ ...textRole(pairing, 'heading'), color: colors.ink }}>
          {t(`${K}title`)}
        </Text>
        <Text style={{ ...textRole(pairing, 'body'), color: colors.inkDim }}>{t(`${K}intro`)}</Text>
        {models.map((m, i) => {
          const card = frozen[i] as EngineRefineCard;
          return <RefineItemCard key={cardKey(m)} model={m} decision={choices.decided.get(cardKey(m)) ?? null} onChoose={(intent) => choices.choose(card, intent)} />;
        })}
        <Text style={{ ...textRole(pairing, 'body'), color: colors.inkDim }}>{t(`${K}footer`)}</Text>
      </ScrollView>
      <View style={[styles.bar, { backgroundColor: colors.canvas, paddingBottom: insets.bottom + space.gapMd }]}>
        <Pill variant="primary" label={t(`${K}${k === n ? 'done' : 'doneForNow'}`)} onPress={() => router.back()} />
      </View>
      <PotSheet visible={choices.pot !== null} pot={choices.pot} onClose={choices.closePot} />
      <DebtSheetHost />
    </DetailScreen>
  );
}

function DoneOnly(): React.JSX.Element {
  const t = useT() as unknown as Translate;
  const insets = useScreenInsets();
  return (
    <DetailScreen title={t('decide.v3.ui.refine.header', { k: 0, n: 0 })}>
      <View style={{ paddingBottom: insets.bottom }}>
        <Pill variant="primary" label={t('decide.v3.ui.refine.done')} onPress={() => router.back()} />
      </View>
    </DetailScreen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: space.screenH, gap: space.gapMd },
  bar: { paddingHorizontal: space.screenH, paddingTop: space.gapMd },
});
