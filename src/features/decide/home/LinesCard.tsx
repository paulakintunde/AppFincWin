/**
 * 05-27 (DCU-03, D-14, D-15): "Lines you will not cross". Five tappable rows showing the user's stored value, or the
 * engine default (prepareContext(snapshot).context.limits) with a 'default' tag while the setting is blank. Open checks
 * recompute from the same settings cache, so a saved limit reaches them in the same render cycle.
 */
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { DecideSettingsRow } from '@/db/decideSettings';
import { prepareContext, type Steadiness } from '@/engine/decide';
import { useT } from '@/i18n';
import { PRESSED_OPACITY, radii, space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { fontSize, textRole } from '@/theme/typography';
import { Text } from '@/ui/Text';
import { Card, Meta, type Money } from '../check/steps/stepUi';
import { monthsText } from '../copy/depthVerdictCopy';
import { percentText } from '../copy/percentText';
import type { SnapshotResult } from '../snapshot/types';
import { FoldRow } from '../ui/FoldRow';
import { InfoLabel } from '../ui/InfoLabel';
import { useInfoSheet } from '../ui/useInfoSheet';
import { useShouldStack } from '../ui/textFit';
import { LIMIT_INFO_KEY, LimitEditorSheet, type LimitKey } from './LimitEditorSheet';

export interface LinesCardProps {
  source: SnapshotResult | null;
  settings: DecideSettingsRow | null;
  userId: string | null;
  currency: string;
  whole: Money;
}

const KEYS: readonly LimitKey[] = ['reserve', 'dsr', 'unsecured', 'investing', 'saving'];

export function LinesCard({ source, settings, userId, currency, whole }: LinesCardProps) {
  const t = useT();
  const [editing, setEditing] = useState<LimitKey | null>(null);
  // D-78: closed by default; the state lives as long as the tab keeps this card mounted.
  const [open, setOpen] = useState(false);

  // One prepareContext per render of the source: the limits for the defaults and the steadiness for the cushion note.
  const context = useMemo(() => {
    if (source === null || source.kind !== 'logged') return null;
    const result = prepareContext(source.snapshot);
    return result.ok ? result.context : null;
  }, [source]);
  const limits = context === null ? null : context.limits;
  const reserveHalfMonths = limits === null ? null : limits.reserveHalfMonths;
  const cushion: { halfMonths: number; steadiness: Steadiness } | null =
    context === null || reserveHalfMonths === null ? null : { halfMonths: reserveHalfMonths, steadiness: context.money.steadiness };

  // The builder ignores money limits stamped in another currency, so they read as blank here too.
  const foreign = settings !== null && settings.currency !== null && settings.currency !== currency;
  const stored = (key: LimitKey): string | null => {
    if (settings === null) return null;
    switch (key) {
      case 'reserve':
        return foreign || settings.reserve === null ? null : whole(settings.reserve);
      case 'investing':
        return foreign || settings.investing_floor === null ? null : whole(settings.investing_floor);
      case 'saving':
        return foreign || settings.saving_floor === null ? null : whole(settings.saving_floor);
      case 'dsr':
        return settings.dsr_line === null ? null : t('decide.lines.dsr.value', { pct: settings.dsr_line });
      case 'unsecured':
        return settings.unsecured_multiple === null
          ? null
          : t('decide.lines.unsecured.value', {
              count: settings.unsecured_multiple,
            });
    }
  };
  const fallback = (key: LimitKey): string | null => {
    if (limits === null) return null;
    switch (key) {
      case 'reserve':
        return whole(limits.reserve);
      case 'investing':
        return whole(limits.investingFloor);
      case 'saving':
        return whole(limits.savingFloor);
      case 'dsr':
        return t('decide.lines.dsr.value', {
          pct: percentText(limits.dsrLine),
        });
      case 'unsecured':
        return t('decide.lines.unsecured.value', {
          count: limits.unsecuredIncomeMultiple,
        });
    }
  };

  const setCount = KEYS.filter((key) => stored(key) !== null).length;
  const preview = setCount === 0 ? t('decide.home.linesFold.allDefault') : t('decide.home.linesFold.preview', { count: setCount });

  return (
    <View testID="lines-card" style={styles.wrap}>
      <Card style={{ paddingVertical: 0, paddingHorizontal: space.cardPadLg }}>
        <FoldRow title={t('decide.home.linesFold.title')} preview={preview} expanded={open} onToggle={() => setOpen((v) => !v)}>
          <View style={{ gap: space.gapSm }}>
            <Meta>{t('decide.lines.sub')}</Meta>
            {KEYS.map((key, i) => {
              const own = stored(key);
              // D-25: the cushion default says how many months it holds; a typed line never carries a default tag.
              const tag =
                key === 'reserve' && cushion !== null
                  ? t('decide.depth.cushion.defaultTag', {
                      months: monthsText(cushion.halfMonths),
                    })
                  : t('decide.lines.defaultTag');
              return (
                <LineRow
                  key={key}
                  lineKey={key}
                  first={i === 0}
                  value={own ?? fallback(key)}
                  isDefault={own === null}
                  tag={tag}
                  onPress={() => setEditing(key)}
                />
              );
            })}
          </View>
        </FoldRow>
      </Card>
      <LimitEditorSheet
        limit={editing}
        userId={userId}
        currency={currency}
        settings={settings}
        source={source}
        cushion={stored('reserve') === null ? cushion : null}
        whole={whole}
        onClose={() => setEditing(null)}
      />
    </View>
  );
}

interface LineRowProps {
  lineKey: LimitKey;
  first: boolean;
  value: string | null;
  isDefault: boolean;
  tag: string;
  onPress: () => void;
}

function LineRow({ lineKey, first, value, isDefault, tag, onPress }: LineRowProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const info = useInfoSheet(LIMIT_INFO_KEY[lineKey]);
  const stack = useShouldStack();
  const name = t(`decide.lines.${lineKey}.name` as const);
  const desc = t(`decide.lines.${lineKey}.desc` as const);
  const a11y = [name, desc, value, isDefault ? tag : null].filter((p): p is string => p !== null && p !== '').join(', ');
  return (
    <View>
      <Pressable
        testID={`line-row-${lineKey}`}
        accessibilityRole="button"
        accessibilityLabel={a11y}
        accessibilityActions={[info.aboutAction]}
        onAccessibilityAction={info.onAccessibilityAction}
        onPress={onPress}
        style={({ pressed }) => [
          styles.row,
          stack ? styles.rowStacked : null,
          !first
            ? {
                borderTopWidth: StyleSheet.hairlineWidth,
                borderTopColor: colors.fill2,
              }
            : null,
          { opacity: pressed ? PRESSED_OPACITY : 1 },
        ]}
      >
        <View style={styles.text}>
          <InfoLabel term={info.term} onInfo={info.open} lineHeight={NAME_LINE}>
            <Text
              style={{
                ...textRole(pairing, 'body'),
                fontSize: fontSize.body,
                color: colors.ink,
              }}
            >
              {name}
            </Text>
          </InfoLabel>
          <Meta>{desc}</Meta>
        </View>
        <View style={stack ? styles.valueStacked : styles.value}>
          {value !== null ? <Text style={{ ...textRole(pairing, 'body'), color: colors.ink }}>{value}</Text> : null}
          {isDefault ? (
            <View style={[styles.tag, { backgroundColor: colors.fill1 }]}>
              <Text
                style={{
                  ...textRole(pairing, 'label'),
                  fontSize: fontSize.tabLabel,
                  color: colors.inkDim,
                }}
              >
                {tag}
              </Text>
            </View>
          ) : null}
        </View>
      </Pressable>
      {info.sheet}
    </View>
  );
}

const NAME_LINE = 22;

const styles = StyleSheet.create({
  wrap: {},
  row: {
    minHeight: space.touchMin,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.gapMd,
    paddingVertical: space.gapSm,
  },
  rowStacked: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  text: { flex: 1, flexShrink: 1 },
  valueStacked: { alignItems: 'flex-start', gap: 4, flexShrink: 1 },
  value: { alignItems: 'flex-end', gap: 4 },
  tag: {
    paddingHorizontal: space.gapSm,
    paddingVertical: 2,
    borderRadius: radii.pill,
  },
});
