/**
 * Plan 05.2-28 (DSU-10, UI-SPEC "Unspent money sheet"): the worked sum plus the actions for the state of the confirmed
 * figure. Opened from the setup page row and from Settings; mounted per opening so every field starts from what is stored.
 *
 * States (unspentView): Not confirmed, Confirmed fresh (rolled forward), Drifted ("Use {sum}" / "Keep {rolled}"), Stale,
 * and Own figure open. Every confirm is a new anchor (unspent_anchor + unspent_anchor_at today) with an Undo toast; Clear
 * sets both back to null with an Undo toast and asks nothing. Toasts carry no amounts (T-05.2-28-02).
 */
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '@/ui/Text';
import { Pill } from '@/ui/Pill';
import { Sheet, SheetScroll } from '@/ui/Sheet';
import { SheetHeader } from '@/ui/SheetHeader';
import { formatLocalDate } from '@/engine/money';
import { useT } from '@/i18n';
import { useDeviceLocale } from '@/services/locale/deviceLocale';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/layout';
import { textRole } from '@/theme/typography';
import { hapticSelection } from '@/ui/haptics';
import { showToast } from '@/state/undoToast';
import { MAX_INPUT_MINOR } from '@/features/decide/snapshot/checkInputs';
import { MoneyInput } from '@/features/decide/ui/MoneyInput';
import { StateChip } from '@/features/decide/ui/StateChip';
import { Meta, TextButton, useCopy, useNoWrapMoney } from '@/features/income/steps/shared';
import { UnspentSumCard } from './UnspentSumCard';
import { useUnspent } from './useUnspent';
import type { UnspentView } from './unspentView';

export interface UnspentSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Opens the account-use step in edit mode ("Set them"). */
  onSetThem?: () => void;
}

export function UnspentSheet(props: UnspentSheetProps) {
  return props.visible ? <UnspentForm {...props} /> : null;
}

const within = (minor: number | null): number | null => (minor !== null && minor >= 0 && minor <= MAX_INPUT_MINOR ? minor : null);

/** The figure the user is looking at now (display units), or null before anything is confirmed. */
function currentFigure(view: UnspentView): number | null {
  switch (view.kind) {
    case 'notConfirmed':
      return null;
    case 'drifted':
      return view.rolled;
    default:
      return view.value;
  }
}

function UnspentForm({ onClose, onSetThem }: UnspentSheetProps) {
  const t = useT();
  const copy = useCopy();
  const { colors, pairing } = useTheme();
  const { locale } = useDeviceLocale();
  const model = useUnspent();
  const money = useNoWrapMoney(model.currency);
  const [ownOpen, setOwnOpen] = useState(false);
  const [own, setOwn] = useState<number | null>(null);
  const title = t('decide.unspentSheet.title');

  const confirmed = (figure: number): void => {
    hapticSelection();
    const result = model.confirm(figure);
    if (result !== null) {
      showToast({
        kind: 'ordinary',
        text: { key: 'decide.unspentSheet.toastConfirmed', params: { undoLabel: 'unspentConfirmed' } },
        stepId: result.stepId,
      });
    }
    onClose();
  };

  const cleared = (): void => {
    hapticSelection();
    const result = model.clear();
    if (result !== null) {
      showToast({
        kind: 'ordinary',
        text: { key: 'decide.unspentSheet.toastCleared', params: { undoLabel: 'unspentCleared' } },
        stepId: result.stepId,
      });
    }
    onClose();
  };

  const view = model.view;
  const sum = model.sum;
  const body = { ...textRole(pairing, 'body'), color: colors.ink };
  const date = (iso: string): string => {
    try {
      return formatLocalDate(iso, locale, 'short');
    } catch {
      return iso;
    }
  };

  const openOwn = (): void => {
    hapticSelection();
    setOwnOpen(true);
  };

  let chip: React.ReactNode = null;
  let stateBody: React.ReactNode = null;
  let actions: React.ReactNode = null;

  if (view !== null && sum !== null) {
    const current = currentFigure(view);
    if (ownOpen) {
      const changed = own !== null && own !== current;
      actions = (
        <View style={styles.actions}>
          <MoneyInput
            value={own}
            currency={model.currency}
            onChange={(m) => setOwn(within(m))}
            label={t('decide.unspentSheet.ownCaption')}
            accessibilityLabel={t('decide.unspentSheet.ownCaption')}
          />
          <Pill label={t('decide.unspentSheet.saveFigure')} variant="primary" disabled={!changed} onPress={() => own !== null && confirmed(own)} />
          <Pill label={t('decide.unspentSheet.keepAsIs')} variant="secondary" onPress={onClose} />
        </View>
      );
    } else if (view.kind === 'drifted') {
      chip = <StateChip tone="adjust" label={t('decide.unspentSheet.chipDrifted')} />;
      stateBody = <Text style={body}>{copy('decide.unspentSheet.driftBody', { rolled: money(view.rolled), sum: money(view.sum) })}</Text>;
      actions = (
        <View style={styles.actions}>
          <Pill label={copy('decide.unspentSheet.useSum', { amount: money(view.sum) })} variant="primary" onPress={() => confirmed(view.sum)} />
          <Pill label={copy('decide.unspentSheet.keepRolled', { amount: money(view.rolled) })} variant="secondary" onPress={() => confirmed(view.rolled)} />
          <TextButton label={t('decide.unspentSheet.ownFigure')} onPress={openOwn} />
        </View>
      );
    } else {
      if (view.kind === 'notConfirmed') {
        chip = <StateChip tone="missing" label={t('decide.unspentSheet.chipNotConfirmed')} />;
        stateBody = <Text style={body}>{t('decide.unspentSheet.bodyNotConfirmed')}</Text>;
      } else if (view.kind === 'stale') {
        chip = <StateChip tone="adjust" label={copy('decide.unspentSheet.chipStale', { n: view.days })} />;
        stateBody = <Text style={body}>{t('decide.unspentSheet.staleBody')}</Text>;
      } else {
        stateBody = (
          <View style={{ gap: space.gapSm }}>
            <Text style={body}>
              {copy('decide.unspentSheet.confirmedLine', { amount: money(view.value), confirmed: money(view.anchor), date: date(view.anchorAt) })}
            </Text>
            <Meta text={copy('decide.unspentSheet.rollNote', { date: date(view.anchorAt) })} />
          </View>
        );
      }
      actions = (
        <View style={styles.actions}>
          <Pill label={t('decide.unspentSheet.thatsRight')} variant="primary" onPress={() => confirmed(sum.total)} />
          <Pill label={t('decide.unspentSheet.ownFigure')} variant="secondary" onPress={openOwn} />
          {view.kind !== 'notConfirmed' ? <TextButton label={t('decide.unspentSheet.clear')} onPress={cleared} danger /> : null}
        </View>
      );
    }
  }

  return (
    <Sheet visible onDismiss={onClose} accessibilityLabel={title} dirty={ownOpen && own !== null}>
      <SheetHeader title={title} cancelLabel={t('record.sheet.cancel')} onCancel={onClose} />
      <SheetScroll contentContainerStyle={styles.column}>
        {chip !== null ? <View style={styles.chip}>{chip}</View> : null}
        {model.lines !== null ? <UnspentSumCard lines={model.lines} currency={model.currency} onSetThem={onSetThem} /> : null}
        {stateBody}
        {actions}
      </SheetScroll>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  column: { gap: space.groupGap },
  chip: { flexDirection: 'row' },
  actions: { gap: space.gapSm },
});
