/**
 * 05.3-32 (D-07, D-08, D-59): the in-place question card. It takes the place of the answer hero while Decide needs one
 * more thing: eyebrow, the catalogue question, the answer controls inside the card (renderBody) and "and N more questions".
 * The "Your answer is saved as you go." line belongs to the answer screen, not here. Every save shows the Undo toast
 * (the label depends on the question) and fires decide_question_answered once. When more questions are queued, focus and
 * a polite "Saved. {next question}" announcement follow the model change; with none left onDone() is called.
 */
import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, StyleSheet, View } from 'react-native';
import { focusNode } from './focusNode';
import { Text } from '@/ui/Text';
import { useT } from '@/i18n';
import { undoLabelText } from '@/i18n/undoLabel';
import { showToast } from '@/state/undoToast';
import { getAnalytics } from '@/services/analytics';
import { askAnsweredProps, type AskQuestion, type askModel } from '@/features/decide/v3/model/ask';
import { useV3Format, type V3Format } from '@/features/decide/v3/shared/useV3Format';
import { radii, space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { fontSize, textRole } from '@/theme/typography';

type Translate = (key: string, options?: Record<string, unknown>) => string;
const K = 'decide.v3.ui.ask.';
const MONEY_KEYS: readonly string[] = ['amount', 'monthly'];

export type AskModel = NonNullable<ReturnType<typeof askModel>>;

export interface AskCardProps {
  model: AskModel;
  renderBody(q: AskQuestion, onSaved: (stepId: string | null) => void): React.ReactNode;
  /** The last queued question was answered. */
  onDone(): void;
}

/** The Undo toast label for a saved answer to this question (undo.label.<key>). */
export function askToastKey(q: AskQuestion): string {
  if (q.code === 'account_use_question') return q.variant === 'fund' ? 'emergencySaved' : 'accountUseSaved';
  if (q.code === 'pay_arrival_question') return 'payArrivalSaved';
  return 'answerSaved';
}

/** The question as a sentence: money formatted, account ids resolved to names, dates and months in the user's locale. */
export function questionText(q: AskQuestion, t: Translate, f: V3Format): string {
  const params: Record<string, string | number> = { ...f.flat(q.params, MONEY_KEYS).screen };
  const date = q.params.date;
  if (typeof date === 'string') params.date = f.date(date);
  const month = q.params.month;
  if (typeof month === 'string') params.month = f.month(month);
  if (typeof q.params.count === 'number') params.count = q.params.count;
  return t(q.questionKey, params);
}

export function AskCard({ model, renderBody, onDone }: AskCardProps): React.JSX.Element {
  const t = useT() as unknown as Translate;
  const f = useV3Format();
  const { colors, pairing } = useTheme();
  const q = model.first;
  const text = questionText(q, t, f);
  const questionRef = useRef<React.ComponentRef<typeof Text> | null>(null);
  // The question that was just answered; the next question's arrival is announced once.
  const [savedFrom, setSavedFrom] = useState<string | null>(null);
  const announcedFor = useRef<string | null>(null);

  // Moves to the question when the card appears; after a save, to the next one with a polite "Saved. {next}".
  useEffect(() => {
    if (savedFrom !== null && savedFrom !== text && announcedFor.current !== savedFrom) {
      announcedFor.current = savedFrom;
      AccessibilityInfo.announceForAccessibility(t(`${K}savedNext`, { next: text }));
    }
    focusNode(questionRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs when the question changes, not when `t` is rebuilt
  }, [q.code, text]);

  const onSaved = (stepId: string | null): void => {
    if (stepId !== null) showToast({ kind: 'ordinary', text: undoLabelText(askToastKey(q), {}), stepId });
    getAnalytics().track('decide_question_answered', askAnsweredProps(q.code));
    if (model.more === 0) onDone();
    else setSavedFrom(text);
  };

  return (
    <View
      accessible={false}
      accessibilityLabel={t(`${K}groupA11y`, { k: model.k, n: model.n, question: text })}
      style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line2 }]}
    >
      <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.eyebrow, color: colors.inkMuted }}>{t(`${K}eyebrow`)}</Text>
      <Text ref={questionRef} accessibilityRole="header" style={{ ...textRole(pairing, 'sheetTitle'), color: colors.ink }}>
        {text}
      </Text>
      {renderBody(q, onSaved)}
      {model.moreKey === null ? null : (
        <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkMuted }}>
          {t(model.moreKey, { count: model.more })}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radii.card, borderWidth: 1, padding: space.cardPadLg, gap: space.gapMd },
});
