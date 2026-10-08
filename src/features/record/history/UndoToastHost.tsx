// D-31, REC-11, REC-12: renders the single undo toast. Mounted once in the signed-in layout.
// Auto-dismiss timing comes from `toastDurationMs`, which returns null while a screen reader
// is on (C-CR-02): the toast then stays until the user dismisses it.
// Item 7 (C-WR-05): Undo is offered only when the toast carries a real step id.
import React, { useEffect, useState } from 'react';
import { AccessibilityInfo, StyleSheet, View } from 'react-native';
import { useT } from '@/i18n';
import { dismissToast, toastDurationMs, useToast, type ToastState } from '@/state/undoToast';
import { useUndo } from '@/data/mutations/undo';
import { useHouseholdMemberNames } from '@/data/queries/activity';
import { UNDO_LABEL_KEYS, type UndoLabelKey, type UndoLabelParams } from '@/engine/undo';
import { useRecordContext } from '@/features/record/useRecordContext';
import { space, useScreenInsets } from '@/theme/layout';
import { ToastView } from '@/ui/ToastView';
import { conflictText, stepLabel } from './undoCopy';

const LABEL_PREFIX = 'undo.label.';

function asNumber(v: unknown): number | undefined {
  return typeof v === 'number' ? v : undefined;
}

/** Derives the engine label key and params from a toast's `undo.label.<key>` text. */
function undoableLabel(toast: ToastState): { labelKey: UndoLabelKey; labelParams: UndoLabelParams } | null {
  const key = toast.text?.key;
  if (!key || !key.startsWith(LABEL_PREFIX)) return null;
  const labelKey = key.slice(LABEL_PREFIX.length);
  if (!(UNDO_LABEL_KEYS as readonly string[]).includes(labelKey)) return null;
  const params = toast.text?.params ?? {};
  const n = asNumber(params.n) ?? asNumber(params.count);
  const name = typeof params.name === 'string' ? params.name : undefined;
  return {
    labelKey: labelKey as UndoLabelKey,
    labelParams: { ...(n !== undefined ? { n } : {}), ...(name !== undefined ? { name } : {}) },
  };
}

export function UndoToastHost() {
  const t = useT();
  const toast = useToast();
  const { undo } = useUndo();
  const ctx = useRecordContext();
  const memberNames = useHouseholdMemberNames(ctx.householdId);
  const insets = useScreenInsets();
  const [screenReader, setScreenReader] = useState(false);

  useEffect(() => {
    let live = true;
    void AccessibilityInfo.isScreenReaderEnabled().then((on) => {
      if (live) setScreenReader(on);
    });
    const sub = AccessibilityInfo.addEventListener('screenReaderChanged', setScreenReader);
    return () => {
      live = false;
      sub.remove();
    };
  }, []);

  const toastId = toast?.id ?? null;
  const kind = toast?.kind ?? null;
  useEffect(() => {
    if (toastId === null || kind === null) return undefined;
    const ms = toastDurationMs(kind, screenReader);
    if (ms === null) return undefined;
    const timer = setTimeout(() => dismissToast(toastId), ms);
    return () => clearTimeout(timer);
  }, [toastId, kind, screenReader]);

  if (!toast) return null;

  const l = t as unknown as (key: string, params?: Record<string, string | number>) => string;
  const parts: string[] = [];
  if (toast.refusal) {
    // A rollback that stopped partway also says how many it did undo.
    if (toast.text?.key === 'undo.rolledBack') parts.push(l(toast.text.key, toast.text.params));
    parts.push(conflictText(t, toast.refusal, ctx.userId ?? '', memberNames));
  } else if (toast.text) {
    const { key, params = {} } = toast.text;
    if (key === 'undo.reverted') {
      const labelParams: UndoLabelParams = {
        ...(asNumber(params.n) !== undefined ? { n: asNumber(params.n) } : {}),
        ...(typeof params.name === 'string' ? { name: params.name } : {}),
      };
      parts.push(l(key, { label: stepLabel(t, String(params.labelKey), labelParams) }));
    } else if (key.startsWith(LABEL_PREFIX)) {
      const label = undoableLabel(toast);
      parts.push(label ? stepLabel(t, label.labelKey, label.labelParams) : l(key, params));
    } else {
      parts.push(l(key, params));
    }
  }
  const message = parts.join(' ');
  if (message === '') return null;

  const label = undoableLabel(toast);
  const canUndo =
    (toast.kind === 'ordinary' || toast.kind === 'destructive') &&
    toast.stepId !== null &&
    label !== null &&
    ctx.userId !== null &&
    ctx.householdId !== null;

  const onUndo = () => {
    if (!label || toast.stepId === null || ctx.userId === null || ctx.householdId === null) return;
    undo({
      stepId: toast.stepId,
      ownerId: ctx.userId,
      householdId: ctx.householdId,
      labelKey: label.labelKey,
      labelParams: label.labelParams,
    });
    dismissToast(toast.id);
  };

  return (
    <View pointerEvents="box-none" style={[styles.host, { bottom: insets.bottom + space.gapMd }]}>
      <ToastView
        message={message}
        actionLabel={canUndo ? t('undo.action') : undefined}
        onAction={canUndo ? onUndo : undefined}
        onDismiss={() => dismissToast(toast.id)}
        dismissLabel={t('a11y.dismiss')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    left: space.screenH,
    right: space.screenH,
  },
});
