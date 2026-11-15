// 06.1-19 (D11, D11H, D-02, D-09): step 1, the kind. A 2-column radio grid (Everyday, Tech, Car, Home, Other, own kinds, and a
// dashed "Add your own"). Home shows the home note and keeps Next disabled; there are no home cost screens. This step is skipped
// when the words already read as a kind that is not Home. Everything is saved to the check as a draft.
// 06.1-57 (A-ST-5): "Read from the words: Car" shows while the kind is the one the typed words gave and the user has not picked one.
import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useCreateCheck } from '@/data/mutations/decideChecks';
import { useT } from '@/i18n';
import { space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { fontSize, textRole } from '@/theme/typography';
import { Screen } from '@/ui/Screen';
import { Text } from '@/ui/Text';
import { useMoneyFormatter } from '@/ui/money/useMoneyFormatter';
import { AddYourOwnSheet } from '../sheets/AddYourOwnSheet';
import { CheckNotFound } from '../ui/CheckNotFound';
import { NeedLine } from '../ui/NeedLine';
import { KindTile } from './KindTile';
import { StepFrame } from './StepFrame';
import { isStillSaving, StepStillSaving } from './StepStillSaving';
import { useOwnAdd } from './ownAdds';
import { firstStepFor, KEY_KIND, kindOf, ownKindsOf, useStepCheck, useStepData, useStepNav, withKind, type StepKind } from './useStepCheck';

const BUILT_IN = ['everyday', 'tech', 'car', 'home', 'other'] as const;

export function KindStep({ id }: { id: string }) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const { dir } = useLocalSearchParams<{ dir?: string }>();
  // 06.1-52 (C-8): a check just created and not yet in the list opens from its queued row, as the answer does.
  const { pendingIds, pendingRows } = useCreateCheck();
  const fallback = React.useMemo(() => pendingRows.find((r) => r.id === id) ?? null, [pendingRows, id]);
  const step = useStepCheck(id, fallback);
  const nav = useStepNav(id, 1, step.flush);
  const data = useStepData();
  const fmt = useMoneyFormatter(false, data.currency);
  const addOwn = useOwnAdd(step);
  const [ownOpen, setOwnOpen] = useState(false);
  const { check, name, status } = step;

  const skip = status === 'ready' && check !== null && dir !== 'back' && firstStepFor(check, name) === 2;
  useEffect(() => {
    if (skip) router.replace(nav.to(2));
    else if (status === 'ready') step.markVisited(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- markVisited is stable per check; run once per arrival
  }, [skip, status, id]);

  if (isStillSaving(status, id, pendingIds)) return <StepStillSaving step={1} name={name} onBack={nav.back} />;
  if (status === 'not_found') return <CheckNotFound />;
  if (status !== 'ready' || check === null || skip) return <Screen>{null}</Screen>;

  const kind = kindOf(check, name);
  const own = ownKindsOf(check);
  const isHome = kind === 'home';
  const readFromWords = kind !== null && typeof check.layerAnswers[KEY_KIND] !== 'string';
  const price = check.price === null ? '' : fmt.formatMoney({ amount: check.price, currency: data.currency as never });
  const meta = price === '' ? name : t('decide.screens.stepper.itemPrice', { item: name, price });
  const pick = (k: StepKind): void => step.update((c) => withKind(c, k));
  const label = (k: StepKind): string => (k.startsWith('own:') ? (own.find((o) => `own:${o.id}` === k)?.name ?? '') : t(`decide.screens.stepper.kind.${k as (typeof BUILT_IN)[number]}`));

  return (
    <>
      <StepFrame
        step={1}
        title={t('decide.screens.stepper.kind.title')}
        why={t('decide.screens.stepper.kind.why')}
        meta={meta}
        direction={dir === 'back' ? 'back' : 'fwd'}
        onBack={nav.back}
        onNext={() => router.replace(nav.to(2))}
        nextDisabled={kind === null || isHome}
        onSeeNow={() => {
          step.finish(1);
          nav.seeAnswer();
        }}
      >
        {readFromWords ? (
          <Text testID="kind-read-from" style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkMuted }}>
            {t('decide.screens.stepper.kind.readFrom', { kind: label(kind) })}
          </Text>
        ) : null}
        <View accessibilityRole="radiogroup" accessibilityLabel={t('decide.screens.stepper.kind.groupA11y')} style={styles.grid}>
          {BUILT_IN.map((k) => (
            <KindTile key={k} testID={`kind-${k}`} title={t(`decide.screens.stepper.kind.${k}`)} sub={t(`decide.screens.stepper.kind.${k}Sub`)} selected={kind === k} onPress={() => pick(k)} />
          ))}
          {own.map((o) => (
            <KindTile key={o.id} testID={`kind-own-${o.id}`} title={o.name} sub={label(o.countsLike)} selected={kind === `own:${o.id}`} onPress={() => pick(`own:${o.id}`)} />
          ))}
          <KindTile testID="kind-add-own" dashed title={t('decide.screens.stepper.kind.addOwn')} sub={t('decide.screens.stepper.kind.addOwnSub')} onPress={() => setOwnOpen(true)} />
        </View>
        {/* 06.1-52 (C-9): Next waits for a kind, and says so. */}
        {kind === null ? <NeedLine testID="kind-need" text={t('decide.screens.common.need.kind')} /> : null}
        {isHome ? (
          <Text testID="home-note" accessibilityRole="alert" style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkDim }}>
            {t('decide.screens.stepper.homeNote')}
          </Text>
        ) : null}
      </StepFrame>
      <AddYourOwnSheet
        visible={ownOpen}
        variant="kind"
        currency={data.currency}
        today={data.today}
        bills={data.billChoices}
        categories={data.categories}
        existingKindCount={own.length}
        onAdd={(add) => {
          setOwnOpen(false);
          addOwn(add);
        }}
        onClose={() => setOwnOpen(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.gapMd },
});
