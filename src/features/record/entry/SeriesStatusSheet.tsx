/**
 * 05.2-44 (D-24): "Stopped or paused". A live series is marked Stopped or Paused from a date; a paused
 * series offers Resume; a stopped one is shown and can only be closed. Each save is one write with one
 * Undo. Past months stay as recorded. Mounted once by ShellEntryHost; the form mounts per opening so every
 * field starts from what is stored.
 */
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '@/ui/Text';
import { Pill } from '@/ui/Pill';
import { Sheet, SheetScroll } from '@/ui/Sheet';
import { SheetHeader } from '@/ui/SheetHeader';
import { useT } from '@/i18n';
import { undoLabelText } from '@/i18n/undoLabel';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/layout';
import { fontSize, textRole } from '@/theme/typography';
import type { RecurringSeriesRow } from '@/db/rows';
import { useSetSeriesStatus } from '@/data/mutations/recurringSeries';
import { showToast } from '@/state/undoToast';
import { useMoneyFormatter } from '@/ui/money/useMoneyFormatter';
import { ChoiceCard } from '@/features/decide/ui/ChoiceCard';
import { useRecordContext } from '@/features/record/useRecordContext';
import { DateField } from './pickers/DateField';
import { closeSeriesStatus, useSeriesStatusRequest } from './seriesStatusHost';
import { resumeAllowed, seriesStatusOf, stopDateProblem } from './seriesStatus';

export function SeriesStatusHost(): React.JSX.Element | null {
  const series = useSeriesStatusRequest();
  return series ? <SeriesStatusForm key={series.id} series={series} onClose={closeSeriesStatus} /> : null;
}

type Choice = 'stop' | 'pause';

function SeriesStatusForm({ series, onClose }: { series: RecurringSeriesRow; onClose: () => void }) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const rc = useRecordContext();
  const formatter = useMoneyFormatter(rc.showCents);
  const setter = useSetSeriesStatus();
  const status = seriesStatusOf(series);
  const [choice, setChoice] = useState<Choice | null>(null);
  const [from, setFrom] = useState(rc.today);
  const [resumeOn, setResumeOn] = useState(() => (status.kind === 'paused' && status.from > rc.today ? status.from : rc.today));

  const sub = { ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkMuted };
  const heading = { ...textRole(pairing, 'sheetTitle'), color: colors.ink };
  const error = { ...textRole(pairing, 'label'), color: colors.danger };
  const cancel = t('record.sheet.cancel');

  const done = (key: 'seriesStopped' | 'seriesPaused' | 'seriesResumed', stepId: string, kind: 'destructive' | 'ordinary'): void => {
    showToast({ kind, text: undoLabelText(key, { name: series.name }), stepId });
    onClose();
  };

  if (status.kind === 'live') {
    const problem = stopDateProblem(series, from, rc.today);
    const canSave = choice !== null && problem === null && rc.userId !== null;
    const save = (): void => {
      if (!canSave || !rc.userId) return;
      if (choice === 'stop') done('seriesStopped', setter.stop(series, from, rc.userId), 'destructive');
      else done('seriesPaused', setter.pause(series, from, rc.userId), 'destructive');
    };
    const title = t('record.seriesStatus.title');
    return (
      <Sheet visible onDismiss={onClose} accessibilityLabel={title}>
        <SheetHeader title={title} cancelLabel={cancel} onCancel={onClose} />
        <SheetScroll contentContainerStyle={styles.column}>
          <Text style={sub}>{series.name}</Text>
          <View accessibilityRole="radiogroup" accessibilityLabel={title} style={styles.options}>
            {(['stop', 'pause'] as const).map((c) => {
              const label = t(c === 'stop' ? 'record.seriesStatus.stopped' : 'record.seriesStatus.paused');
              return (
                <ChoiceCard key={c} selected={choice === c} title={label} accessibilityLabel={label} onPress={() => setChoice(c)}>
                  <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: choice === c ? colors.inkSoft1 : colors.inkMuted }}>
                    {t(c === 'stop' ? 'record.seriesStatus.stoppedBody' : 'record.seriesStatus.pausedBody')}
                  </Text>
                </ChoiceCard>
              );
            })}
          </View>
          <DateField label={t('record.seriesStatus.fromDate')} value={from} display={formatter.formatDate(from)} onChange={setFrom} />
          {problem !== null ? (
            <Text accessibilityRole="alert" style={error}>
              {t(problem === 'tooEarly' ? 'record.seriesStatus.dateTooEarly' : 'record.seriesStatus.dateTooOld')}
            </Text>
          ) : null}
          <Text style={sub}>{t('record.seriesStatus.pastNote')}</Text>
          <View style={styles.actions}>
            <Pill label={t('record.seriesStatus.save')} variant="primary" disabled={!canSave} onPress={save} />
          </View>
        </SheetScroll>
      </Sheet>
    );
  }

  const statusLine =
    status.kind === 'paused'
      ? t('record.seriesStatus.statusPaused', { date: formatter.formatDate(status.from) })
      : t('record.seriesStatus.statusStopped', { date: formatter.formatDate(status.from) });
  const title = status.kind === 'paused' ? t('record.seriesStatus.resumeTitle', { name: series.name }) : t('record.seriesStatus.title');
  const a11y = t('record.seriesStatus.a11yStatus', { name: series.name, status: statusLine });

  if (status.kind === 'stopped') {
    return (
      <Sheet visible onDismiss={onClose} accessibilityLabel={title}>
        <SheetHeader title={title} cancelLabel={cancel} onCancel={onClose} />
        <SheetScroll contentContainerStyle={styles.column}>
          <Text accessibilityLabel={a11y} style={heading}>
            {statusLine}
          </Text>
        </SheetScroll>
      </Sheet>
    );
  }

  const canResume = rc.userId !== null && resumeAllowed(series, resumeOn, rc.today);
  const resume = (): void => {
    if (!canResume || !rc.userId) return;
    done('seriesResumed', setter.resume(series, resumeOn, rc.userId), 'ordinary');
  };
  return (
    <Sheet visible onDismiss={onClose} accessibilityLabel={title}>
      <SheetHeader title={title} cancelLabel={cancel} onCancel={onClose} />
      <SheetScroll contentContainerStyle={styles.column}>
        <Text accessibilityRole="header" accessibilityLabel={a11y} style={heading}>
          {statusLine}
        </Text>
        <DateField
          label={t('record.seriesStatus.resumeDate')}
          value={resumeOn}
          display={formatter.formatDate(resumeOn)}
          onChange={setResumeOn}
          minDate={status.from}
        />
        <Text style={sub}>{t('record.seriesStatus.pastNote')}</Text>
        <View style={styles.actions}>
          <Pill label={t('record.seriesStatus.resumeSave')} variant="primary" disabled={!canResume} onPress={resume} />
        </View>
      </SheetScroll>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  column: { gap: space.gapMd },
  options: { gap: space.gapSm },
  actions: { gap: space.gapSm, marginTop: space.gapSm },
});
