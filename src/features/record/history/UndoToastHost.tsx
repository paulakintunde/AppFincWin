// D-31, REC-11, REC-12: renders the single undo toast.
// D-16: it lives in the TOP-most layer. placement 'app' (mounted in the signed-in layout) renders only
// while no sheet is open; placement 'sheet' (SheetToastOverlay, injected into the top sheet's Modal via
// SheetOverlayProvider) always renders. Both schedule the REMAINING time from `shownAt`, so moving
// between layers never restarts the timer (research Pitfall 9).
// Auto-dismiss timing comes from `toastDurationMs`, which returns null while a screen reader
// is on (C-CR-02): the toast then stays until the user dismisses it.
// Item 7 (C-WR-05): Undo is offered only when the toast carries a real step id.
import React, { useEffect, useState } from 'react';
import { AccessibilityInfo, StyleSheet, View } from 'react-native';
import { useT } from '@/i18n';
import { dismissToast, toastDurationMs, useToast, useToastFloor, type ToastState } from '@/state/undoToast';
import { useUndo } from '@/data/mutations/undo';
import { useHouseholdMemberNames } from '@/data/queries/activity';
import { UNDO_LABEL_KEYS, type UndoLabelKey, type UndoLabelParams } from '@/engine/undo';
import { useRecordContext } from '@/features/record/useRecordContext';
import { space, useScreenInsets } from '@/theme/layout';
import { useSheetCount } from '@/state/sheetStack';
import { useToastSlot } from '@/shell/fab/useShellPositions';
import { ToastView } from '@/ui/ToastView';
import { conflictText, stepLabel } from './undoCopy';

// S-CR-04: undoLabelText emits `undo.labelUnnamed.<key>` for a step with no name (a Phase 1
// row, an import, an unresolved transfer account). Both shapes carry the same engine label key.
const LABEL_PREFIXES = ['undo.label.', 'undo.labelUnnamed.'] as const;

function labelPrefixOf(key: string): string | undefined {
  return LABEL_PREFIXES.find((p) => key.startsWith(p));
}

function asNumber(v: unknown): number | undefined {
  return typeof v === 'number' ? v : undefined;
}

// 05-72 / D-73: the Decide toasts keep their own words ("Check deleted. Nothing was written.") but replay an undo step like any
// other, so each carries the engine label key of the step it recorded. Without this map their text is not an `undo.label.*` key,
// `undoableLabel` returns null and the toast shows no Undo.
const DECIDE_TOAST_LABEL: Readonly<Record<string, UndoLabelKey>> = {
  'decide.delete.toastCheck': 'checkDeleted',
  'decide.clear.toast': 'checkCleared',
  'decide.delete.toastDecision': 'decisionDeleted',
  'decide.delete.toastChange': 'changeDeleted',
  'decide.toast.unlinked': 'lineUnlinked',
  // D-105: the Pots toasts keep their own words too. "Pot saved" is shared by add and edit, so PotSheet passes `undoLabel` in the
  // toast params to say which step it recorded; the map entry is the fallback.
  'decide.pots.toast.saved': 'potEdited',
  'decide.pots.toast.deleted': 'potDeleted',
  'decide.pots.toast.done': 'potDone',
  'decide.pots.toast.reopened': 'potReopened',
  'decide.depth.goal.tagged': 'transferTagged',
  'decide.depth.goal.untagged': 'transferUntagged',
  // 05.2-23: the setup stepper's "{title} saved" toast replays the step's settings write.
  'decide.setup.shell.toastSaved': 'setupStepSaved',
};

/** Derives the engine label key and params from a toast's `undo.label[Unnamed].<key>` text (or a Decide toast's own key). */
function undoableLabel(toast: ToastState): { labelKey: UndoLabelKey; labelParams: UndoLabelParams } | null {
  const key = toast.text?.key;
  const override = toast.text?.params?.undoLabel;
  const decideLabel =
    typeof override === 'string' && (UNDO_LABEL_KEYS as readonly string[]).includes(override)
      ? (override as UndoLabelKey)
      : key
        ? DECIDE_TOAST_LABEL[key]
        : undefined;
  const prefix = key ? labelPrefixOf(key) : undefined;
  if (!key || (prefix === undefined && decideLabel === undefined)) return null;
  const labelKey = decideLabel ?? key.slice(prefix?.length ?? 0);
  if (!(UNDO_LABEL_KEYS as readonly string[]).includes(labelKey)) return null;
  const params = toast.text?.params ?? {};
  const n = asNumber(params.n) ?? asNumber(params.count);
  const name = typeof params.name === 'string' ? params.name : undefined;
  return {
    labelKey: labelKey as UndoLabelKey,
    labelParams: { ...(n !== undefined ? { n } : {}), ...(name !== undefined ? { name } : {}) },
  };
}

export function UndoToastHost({ placement = 'app' }: { placement?: 'app' | 'sheet' }) {
  const t = useT();
  const toast = useToast();
  const { undo } = useUndo();
  const ctx = useRecordContext();
  const memberNames = useHouseholdMemberNames(ctx.householdId);
  const insets = useScreenInsets();
  const sheetCount = useSheetCount();
  const active = placement === 'sheet' || sheetCount === 0;
  const slot = useToastSlot();
  const floor = useToastFloor();
  const { reportHeight } = slot;
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
  const shownAt = toast?.shownAt ?? 0;
  useEffect(() => {
    if (!active || toastId === null || kind === null) return undefined;
    const ms = toastDurationMs(kind, screenReader);
    if (ms === null) return undefined;
    const timer = setTimeout(() => dismissToast(toastId), Math.max(0, ms - (Date.now() - shownAt)));
    return () => clearTimeout(timer);
  }, [toastId, kind, screenReader, active, shownAt]);

  // The app-layer toast feeds the FAB lift; clear it when the toast goes or this host stops being the visible one.
  const reporting = placement === 'app' && active && toastId !== null;
  useEffect(() => {
    if (placement !== 'app') return undefined;
    if (reporting) return undefined;
    reportHeight(null);
    return undefined;
  }, [placement, reporting, reportHeight]);
  useEffect(() => {
    if (placement !== 'app') return undefined;
    return () => reportHeight(null);
  }, [placement, reportHeight]);

  if (!active || !toast) return null;

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
    } else if (labelPrefixOf(key) !== undefined) {
      const label = undoableLabel(toast);
      parts.push(label ? stepLabel(t, label.labelKey, label.labelParams) : l(key, params));
    } else {
      parts.push(l(key, params));
    }
  }
  const bottom = placement === 'sheet' ? insets.bottom + space.sheetPadBottom : Math.max(slot.bottom, floor ?? 0);
  const message = parts.join(' ');
  if (message === '') return null;

  const label = undoableLabel(toast);
  const localUndo = toast.onUndo;
  const group = toast.stepIds !== null && toast.stepIds.length >= 2 ? toast.stepIds : null;
  const hasStep = toast.stepId !== null || toast.stepIds !== null;
  const canUndo =
    localUndo !== null ||
    ((toast.kind === 'ordinary' || toast.kind === 'destructive') &&
    hasStep &&
    label !== null &&
    ctx.userId !== null &&
    ctx.householdId !== null);

  const onUndo = () => {
    if (localUndo !== null) {
      dismissToast(toast.id);
      localUndo();
      return;
    }
    const single = toast.stepId ?? toast.stepIds?.[0] ?? null;
    if (!label || single === null || ctx.userId === null || ctx.householdId === null) return;
    if (group !== null) {
      // One user action, one Undo: replay the whole group, last saved first, through the serial write queue.
      for (const id of [...group].reverse()) {
        undo({
          stepId: id,
          ownerId: ctx.userId,
          householdId: ctx.householdId,
          labelKey: label.labelKey,
          labelParams: label.labelParams,
        });
      }
      dismissToast(toast.id);
      return;
    }
    undo({
      stepId: single,
      ownerId: ctx.userId,
      householdId: ctx.householdId,
      labelKey: label.labelKey,
      labelParams: label.labelParams,
    });
    dismissToast(toast.id);
  };

  return (
    <View
      pointerEvents="box-none"
      style={[styles.host, { bottom }]}
      onLayout={placement === 'app' ? (e) => reportHeight(e.nativeEvent.layout.height) : undefined}
    >
      <ToastView
        message={message}
        actionLabel={canUndo ? t('undo.action') : undefined}
        onAction={canUndo ? onUndo : undefined}
        onDismiss={() => dismissToast(toast.id)}
        dismissLabel={t('a11y.dismiss')}
        tone={toast.tone}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    left: space.groupGap,
    right: space.groupGap,
  },
});

/** D-16: handed to SheetOverlayProvider so the top sheet's native window hosts the toast. */
export function SheetToastOverlay() {
  return <UndoToastHost placement="sheet" />;
}
