// 06.1-19 (D11, D11H, D-02, D-09): step 1, the kind. A 2-column radio grid (Everyday, Tech, Car, Home, Other, own kinds, and a
// dashed "Add your own"). Home shows the home note and keeps Next disabled; there are no home cost screens. This step is skipped
// when the words already read as a kind that is not Home. Everything is saved to the check as a draft.
import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useT } from '@/i18n';
import { space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { fontSize, textRole } from '@/theme/typography';
import { Screen } from '@/ui/Screen';
import { Text } from '@/ui/Text';
import { useMoneyFormatter } from '@/ui/money/useMoneyFormatter';
import { AddYourOwnSheet } from '../sheets/AddYourOwnSheet';
import { KindTile } from './KindTile';
import { StepFrame } from './StepFrame';
import { useOwnAdd } from './ownAdds';
import { firstStepFor, kindOf, ownKindsOf, stepHref, useStepCheck, useStepData, withKind, type StepKind } from './useStepCheck';

const BUILT_IN = ['everyday', 'tech', 'car', 'home', 'other'] as const;

export function KindStep({ id }: { id: string }) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const { dir } = useLocalSearchParams<{ dir?: string }>();
  const step = useStepCheck(id);
  const data = useStepData();
  const fmt = useMoneyFormatter(false, data.currency);
  const addOwn = useOwnAdd(step);
  const [ownOpen, setOwnOpen] = useState(false);
  const { check, name, status } = step;

  const skip = status === 'ready' && check !== null && dir !== 'back' && firstStepFor(check, name) === 2;
  useEffect(() => {
    if (skip) router.replace(stepHref(2, id));
    else if (status === 'ready') step.markVisited(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- markVisited is stable per check; run once per arrival
  }, [skip, status, id]);

  if (status !== 'ready' || check === null || skip) return <Screen>{null}</Screen>;

  const kind = kindOf(check, name);
  const own = ownKindsOf(check);
  const isHome = kind === 'home';
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
        onBack={() => router.replace('/decide' as never)}
        onJump={() => undefined}
        onNext={() => router.replace(stepHref(2, id))}
        nextDisabled={kind === null || isHome}
        onSeeNow={() => {
          step.finish(1);
          // 06.1-49 (A-ST-3, D20): push, so Back from the answer returns to this step.
          router.push(`/decide/answer/${id}` as never);
        }}
      >
        <View accessibilityRole="radiogroup" accessibilityLabel={t('decide.screens.stepper.kind.groupA11y')} style={styles.grid}>
          {BUILT_IN.map((k) => (
            <KindTile key={k} testID={`kind-${k}`} title={t(`decide.screens.stepper.kind.${k}`)} sub={t(`decide.screens.stepper.kind.${k}Sub`)} selected={kind === k} onPress={() => pick(k)} />
          ))}
          {own.map((o) => (
            <KindTile key={o.id} testID={`kind-own-${o.id}`} title={o.name} sub={label(o.countsLike)} selected={kind === `own:${o.id}`} onPress={() => pick(`own:${o.id}`)} />
          ))}
          <KindTile testID="kind-add-own" dashed title={t('decide.screens.stepper.kind.addOwn')} sub={t('decide.screens.stepper.kind.addOwnSub')} onPress={() => setOwnOpen(true)} />
        </View>
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
