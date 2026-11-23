// 09-22 (UI-SPEC 11, D-32..D-36, TIER-02, TIER-03): You > Features. The level card, a search field, and every built feature
// by area with its switch. A feature above the level or switched off is absent from the rest of the app but always listed
// here (D-34). Decide and Coach are not rows (D-33, D-25). A switch writes at once; there is no Save button.
// 09-23: `preview` shows a level and switch map not applied yet (the onboarding summary's "See what is on", UI-SPEC 2b):
// read-only switches, no plan link and no "Run setup again"; changes apply on the summary's Continue.
import React, { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { useT } from '@/i18n';
import { DetailScreen } from '@/shell/screen/DetailScreen';
import { PlanLink } from '@/features/plans/components/NoticeCard';
import { ONBOARDING_HREF, plansHref } from '@/features/plans/routes';
import { usePlanState } from '@/features/plans/usePlanState';
import { Chip } from '@/ui/Chip';
import { ReadOnlyScope } from '@/ui/ReadOnlyScope';
import { Row } from '@/ui/Row';
import { Text } from '@/ui/Text';
import { TextInput } from '@/ui/TextInput';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, space } from '@/theme/layout';
import { shadows } from '@/theme/tokens';
import { textRole } from '@/theme/typography';
import { FeatureRow } from './components/FeatureRow';
import { FEATURES, LEVELS, type FeatureArea, type FeatureId, type Level } from './featureRegistry';
import { useAllFeatureAccess, type AccessPreview } from './useFeatureAccess';
import { useChangeFeatureSwitch } from './useChangeFeatureSwitch';
import { useUserSetup } from './useUserSetup';

type L = (key: string, params?: Record<string, string | number>) => string;

/** Section order. Insight has no built feature yet, and an empty section is not drawn. */
const AREA_ORDER: readonly FeatureArea[] = ['Recording', 'Accounts', 'Planning', 'Grow', 'Insight', 'Sharing', 'System'];

const RERUN_HREF = { pathname: ONBOARDING_HREF as unknown as string, params: { mode: 'rerun' } } as unknown as Href;
const HOUSEHOLD_HREF = '/household' as Href;

export function levelKey(level: Level): (typeof LEVELS)[number]['key'] {
  return (LEVELS.find((l) => l.level === level) ?? LEVELS[3]).key;
}

type Param = string | string[] | undefined;
const one = (p: Param): string | undefined => (Array.isArray(p) ? p[0] : p);

/** Route params to a preview, or undefined when this is the normal screen. Unknown feature ids and bad levels are dropped. */
export function parseFeaturesPreview(params: { preview?: Param; level?: Param; on?: Param; off?: Param }): AccessPreview | undefined {
  if (one(params.preview) !== '1') return undefined;
  const n = Number(one(params.level));
  const level = (n === 1 || n === 2 || n === 3 || n === 4 ? n : 4) as Level;
  const known = new Set<string>(FEATURES.map((f) => f.id));
  const switches: Record<string, boolean> = {};
  const add = (p: Param, value: boolean) => {
    for (const id of (one(p) ?? '').split(',')) if (known.has(id)) switches[id] = value;
  };
  add(params.off, false);
  add(params.on, true);
  return { level, switches };
}

export function FeaturesScreen({ preview }: { preview?: AccessPreview } = {}) {
  const t = useT() as unknown as L;
  const { colors, pairing } = useTheme();
  const plan = usePlanState();
  const setup = useUserSetup();
  const access = useAllFeatureAccess(preview);
  const change = useChangeFeatureSwitch();
  const [query, setQuery] = useState('');

  const level: Level = preview?.level ?? setup.data?.level ?? 4;
  const key = levelKey(level);
  const onCount = access.filter((a) => a.on).length;
  // The one plan link at the top: locked and sample (09-25: in sample the rows stay switchable and carry no plan reason).
  const locked = !plan.writable && !plan.loading && preview === undefined;

  const needle = query.trim().toLocaleLowerCase();
  const sections = useMemo(() => {
    const byId = new Map(access.map((a) => [a.id, a] as const));
    return AREA_ORDER.map((area) => {
      const rows = FEATURES.filter((f) => f.area === area)
        .filter((f) => {
          if (needle === '') return true;
          const text = `${t(`features.items.${f.id}.label`)} ${t(`features.items.${f.id}.sub`)}`.toLocaleLowerCase();
          return text.includes(needle);
        })
        .map((f) => byId.get(f.id as FeatureId))
        .filter((a): a is NonNullable<typeof a> => a !== undefined);
      return { area, rows };
    }).filter((s) => s.rows.length > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- t is stable per language
  }, [access, needle]);

  return (
    <DetailScreen title={t('features.title')}>
      <View style={styles.column} testID={preview === undefined ? 'features-screen' : 'features-preview'}>
        {locked ? (
          <PlanLink
            label={t('features.reasons.choosePlan')}
            testID="features-choose-plan"
            onPress={() =>
              router.push(
                plan.status === 'sample'
                  ? plansHref({ mode: 'first_run', trigger: 'sample_bar' })
                  : plansHref({ mode: 'locked', trigger: 'locked' }),
              )
            }
          />
        ) : null}

        <View style={[styles.card, shadows.card, { backgroundColor: colors.surface }]} testID="features-level-card">
          <View style={styles.levelHead}>
            <Text accessibilityRole="header" style={{ ...textRole(pairing, 'sheetTitle'), color: colors.ink }}>
              {t(`features.levels.${key}.name`)}
            </Text>
            <Chip label={t('features.levelChip')} selected />
          </View>
          <Text style={{ ...textRole(pairing, 'body'), color: colors.inkDim }}>{t(`features.levels.${key}.sentence`)}</Text>
          <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>
            {t('features.count', { count: onCount, total: FEATURES.length })}
          </Text>
          {preview === undefined ? (
            <Row label={t('features.runSetup')} chevron onPress={() => router.push(RERUN_HREF)} />
          ) : null}
        </View>

        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={t('features.search')}
          accessibilityLabel={t('features.search')}
          autoCorrect={false}
          placeholderTextColor={colors.inkMuted}
          style={[
            styles.search,
            { ...textRole(pairing, 'body'), color: colors.ink, backgroundColor: colors.fill1 },
          ]}
        />

        {sections.length === 0 ? (
          <View style={styles.empty} testID="features-empty">
            <Text style={{ ...textRole(pairing, 'bodyStrong'), color: colors.ink }}>{t('features.empty.title')}</Text>
            <Text style={{ ...textRole(pairing, 'body'), color: colors.inkDim }}>{t('features.empty.body')}</Text>
          </View>
        ) : (
          <ReadOnlyScope.Provider value={preview !== undefined}>
            {sections.map((s) => (
              <View key={s.area} style={styles.section} testID={`features-area-${s.area}`}>
                <Text accessibilityRole="header" style={{ ...textRole(pairing, 'sheetTitle'), color: colors.ink }}>
                  {t(`features.areas.${s.area.toLocaleLowerCase()}`)}
                </Text>
                <View style={[styles.card, shadows.card, styles.rows, { backgroundColor: colors.surface }]}>
                  {s.rows.map((a, i) => (
                    <View key={a.id} style={i > 0 ? { borderTopWidth: 1, borderTopColor: colors.line1 } : null}>
                      <FeatureRow
                        access={a}
                        onChange={change}
                        {...(preview === undefined ? { onSetUpSharing: () => router.push(HOUSEHOLD_HREF) } : {})}
                      />
                    </View>
                  ))}
                </View>
              </View>
            ))}
          </ReadOnlyScope.Provider>
        )}
      </View>
    </DetailScreen>
  );
}

const styles = StyleSheet.create({
  column: { gap: space.groupGap, paddingTop: space.gapSm },
  card: { borderRadius: radii.card, padding: space.cardPad, gap: space.gapSm },
  rows: { paddingVertical: 0, paddingHorizontal: space.rowPad, gap: 0 },
  levelHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.gapSm },
  search: { minHeight: space.touchMin, borderRadius: radii.pill, paddingHorizontal: space.cardPad },
  section: { gap: space.gapSm },
  empty: { gap: space.gapSm, paddingVertical: space.groupGap },
});
