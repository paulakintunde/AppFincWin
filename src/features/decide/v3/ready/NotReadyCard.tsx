/**
 * 05.3-26 (D-06), 05.3-58 (D-24, D-29): the not-ready card. It asks instead of blocking: each named gap sits under its
 * month as a title (name, amount, date), a status line and a question, then the answer chips. A chip is one write through
 * useReadinessAnswer, with Undo. Bills also get the quiet "Someone else always pays this" link, and each month group ends
 * with its "<Month> is complete as it is" link. Envelopes are one named item with Open envelopes.
 *
 * TalkBack: each item's text is one accessible group (itemA11y, money read through moneyA11y); every chip and link is its
 * own button with its visible label. Chips wrap by whole word in a wrapping row; nothing clamps at 320 wide or 2.0x text.
 *
 * W3: an item's chips are disabled while its answer is being written. The pending keys belong to the readiness they were
 * made under, so any new readiness object clears them, and a failed write (onSettled(false)) clears its own key.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/ui/Text';
import { useT } from '@/i18n';
import type { Readiness, YearMonth } from '@/engine/decide/v3';
import {
  notReadyGroups,
  notReadyRows,
  type NotReadyChip,
  type NotReadyItemView,
  type NotReadyTitleParams,
} from '@/features/decide/v3/model/notReady';
import { useV3Format, type V3Format } from '@/features/decide/v3/shared/useV3Format';
import { useRecordContext } from '@/features/record/useRecordContext';
import { getAnalytics } from '@/services/analytics';
import { radii, space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { fontSize, textRole } from '@/theme/typography';
import { useReadinessAnswer } from './useReadinessAnswer';

type Translate = (key: string, options?: Record<string, unknown>) => string;
type Count = '1' | '2' | '3';

const K = 'decide.v3.ui.notReady.';

export interface NotReadyCardProps {
  readiness: Readiness | undefined;
  thisMonth: YearMonth;
  /** Fired once when the last row goes: the parent announces "Decide can check a purchase now." */
  onReady?: () => void;
}

/** The pending keys and the readiness they were made under: a different readiness means nothing is pending. */
interface Pending {
  readonly of: Readiness | undefined;
  readonly keys: ReadonlySet<string>;
}

function titleStrings(p: NotReadyTitleParams, f: V3Format, money: (minor: number) => string): Record<string, string> {
  const out: Record<string, string> = {};
  if (p.name !== undefined) out.name = p.name;
  if (p.names !== undefined) out.names = p.names.join(', ');
  if (p.more !== undefined) out.more = String(p.more);
  if (p.amount !== undefined) out.amount = money(p.amount);
  if (p.date !== undefined) out.date = f.date(p.date);
  if (p.month !== undefined) out.month = f.month(p.month);
  return out;
}

export function NotReadyCard({ readiness, thisMonth, onReady }: NotReadyCardProps): React.JSX.Element | null {
  const t = useT() as unknown as Translate;
  const f = useV3Format();
  const { colors, pairing } = useTheme();
  const { today } = useRecordContext();
  const { answer } = useReadinessAnswer();
  const rows = notReadyRows(readiness, thisMonth);
  const count = rows.length;
  const first = rows[0]?.code;

  const [pendingState, setPendingState] = useState<Pending>({ of: readiness, keys: new Set() });
  const pending: ReadonlySet<string> = pendingState.of === readiness ? pendingState.keys : new Set();

  const hadRows = useRef(false);
  const shown = useRef(false);
  useEffect(() => {
    if (count > 0) {
      hadRows.current = true;
      if (!shown.current && first !== undefined) {
        shown.current = true;
        getAnalytics().track('decide_not_ready_shown', { first, count: String(count) as Count });
      }
    } else if (hadRows.current) {
      hadRows.current = false;
      onReady?.();
    }
  }, [count, first, onReady]);

  if (count === 0) return null;

  const groups = notReadyGroups(readiness, thisMonth, today);

  const press = (key: string, view: NotReadyItemView | null, c: NotReadyChip): void => {
    // Opening a screen writes nothing, so it never holds the chips.
    const writes = c.action.kind !== 'open';
    if (writes) {
      setPendingState((prev) => {
        const keys = new Set(prev.of === readiness ? prev.keys : []);
        keys.add(key);
        return { of: readiness, keys };
      });
    }
    answer(view?.item ?? null, c.action, (ok) => {
      if (ok || !writes) return;
      setPendingState((prev) => {
        if (!prev.keys.has(key)) return prev;
        const keys = new Set(prev.keys);
        keys.delete(key);
        return { of: prev.of, keys };
      });
    });
  };

  const chipLabel = (c: NotReadyChip): string =>
    t(c.labelKey, c.labelParams?.month === undefined ? {} : { month: f.month(c.labelParams.month) });

  const chipButton = (key: string, view: NotReadyItemView | null, c: NotReadyChip): React.JSX.Element => {
    const label = chipLabel(c);
    const disabled = pending.has(key);
    return (
      <Pressable
        key={c.key}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={() => press(key, view, c)}
        style={[styles.button, { backgroundColor: colors.surface, borderColor: colors.line4 }]}
      >
        <Text style={{ ...textRole(pairing, 'label'), color: colors.ink, textAlign: 'center' }}>{label}</Text>
      </Pressable>
    );
  };

  const linkButton = (key: string, view: NotReadyItemView | null, c: NotReadyChip): React.JSX.Element => {
    const label = chipLabel(c);
    const disabled = pending.has(key);
    return (
      <Pressable
        key={c.key}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={() => press(key, view, c)}
        style={styles.link}
      >
        <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>{label}</Text>
      </Pressable>
    );
  };

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line2 }]}>
      <Text accessibilityRole="header" style={{ ...textRole(pairing, 'sheetTitle'), color: colors.ink }}>
        {t(`${K}heading`)}
      </Text>
      {groups.map((group) => (
        <View key={group.key} style={styles.group}>
          <Text style={{ ...textRole(pairing, 'label'), color: colors.inkDim }}>
            {t(group.headingKey, group.month === null ? {} : { month: f.month(group.month) })}
          </Text>
          {group.items.map((view, i) => {
            const title = t(view.titleKey, titleStrings(view.titleParams, f, f.money));
            const titleA11y = t(view.titleKey, titleStrings(view.titleParams, f, f.moneyA11y));
            const statusText = t(view.statusKey, titleStrings(view.titleParams, f, f.money));
            const question = view.questionKey === null ? '' : t(view.questionKey);
            const a11y = t(`${K}itemA11y`, { title: titleA11y, status: statusText, question }).trim();
            const key = `item|${view.key}`;
            return (
              <View key={view.key} style={[styles.item, i > 0 ? { borderTopWidth: 1, borderTopColor: colors.line1 } : null]}>
                <View accessible accessibilityLabel={a11y} style={styles.text}>
                  <Text style={{ ...textRole(pairing, 'label'), color: colors.ink }}>{title}</Text>
                  <Text style={{ ...textRole(pairing, 'body'), fontSize: fontSize.s13_5, color: colors.inkDim }}>{statusText}</Text>
                  {question === '' ? null : <Text style={{ ...textRole(pairing, 'body'), color: colors.ink }}>{question}</Text>}
                </View>
                <View style={styles.chips}>{view.chips.map((c) => chipButton(key, view, c))}</View>
                {view.link === null ? null : linkButton(key, view, view.link)}
              </View>
            );
          })}
          {group.monthLink === null ? null : linkButton(`month|${group.key}`, null, group.monthLink)}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radii.card, borderWidth: 1, padding: space.cardPadLg, gap: space.gapMd },
  group: { gap: space.gapSm },
  item: { gap: space.gapSm, paddingTop: space.gapMd },
  text: { gap: space.gapSm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.gapSm },
  button: {
    maxWidth: '100%',
    minHeight: space.touchMin,
    paddingHorizontal: space.cardPad,
    borderRadius: radii.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  link: { alignSelf: 'flex-start', maxWidth: '100%', minHeight: space.touchMin, justifyContent: 'center' },
});
