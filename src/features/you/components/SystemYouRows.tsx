// 10-27 (UI-SPEC Navigation and Entry Points): the You rows Phase 10 adds, each with a live sublabel.
//  - Security: "Lock off", or "{method} · {timing}" (method: Phone lock or FincWin PIN; timing: "after 1 minute").
//  - Alerts: "{n} on", counted from the person's own alert switches. Always shown, at every level (D-09).
//  - Archive: "{n} months". The caller shows it only when the archive feature is on (level 4).
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useT } from '@/i18n';
import { Row } from '@/ui/Row';
import { ALERT_KINDS, DEFAULT_ALERT_SETTINGS } from '@/db/alerts';
import { useAlertSettings } from '@/data/queries/alerts';
import { useAuth } from '@/features/auth/AuthProvider';
import { useArchiveState } from '@/features/archive/useArchiveState';
import { subscribeLockChanged } from '@/features/lock/lockEvents';
import { TIMING_CHOICES } from '@/features/lock/timing';
import { loadLockState, type LockState } from '@/services/lock/lockStore';

type RowProps = { tile: ReactNode; onPress: () => void };

/** "after 1 minute": the timing choice's own words, first letter lower-cased so it reads after the dot. */
function lowerFirst(s: string): string {
  return s.length === 0 ? s : s.charAt(0).toLowerCase() + s.slice(1);
}

export function SecurityYouRow({ tile, onPress }: RowProps) {
  const t = useT();
  const [lock, setLock] = useState<LockState | null>(null);
  const load = useCallback(() => {
    void loadLockState()
      .then(setLock)
      .catch(() => undefined);
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reads the phone's lock settings once on mount
    load();
    return subscribeLockChanged(load);
  }, [load]);

  let sublabel: string | undefined;
  if (lock !== null) {
    if (!lock.settings.enabled) sublabel = t('system.security.rowSubOff');
    else {
      const timingKey = TIMING_CHOICES.find((c) => c.timing === lock.settings.timing)?.key ?? 'system.appLock.timingOneMinute';
      sublabel = t('system.security.rowSubOn', {
        method: t(lock.settings.lockMethod === 'appPin' ? 'system.security.methodPin' : 'system.security.methodDevice'),
        timing: lowerFirst(t(timingKey)),
      });
    }
  }
  return <Row label={t('system.security.title')} sublabel={sublabel} leading={tile} chevron onPress={onPress} />;
}

export function AlertsYouRow({ tile, onPress }: RowProps) {
  const t = useT();
  const { user } = useAuth();
  const data = useAlertSettings(user?.id).data;
  const settings = data ?? ALERT_KINDS.map((k) => DEFAULT_ALERT_SETTINGS[k]);
  const count = settings.filter((s) => s.enabled).length;
  return <Row label={t('system.alerts.title')} sublabel={t('system.alerts.rowSub', { count })} leading={tile} chevron onPress={onPress} />;
}

export function ArchiveYouRow({ tile, onPress }: RowProps) {
  const t = useT();
  const { count } = useArchiveState();
  return <Row label={t('system.archive.rowLabel')} sublabel={t('system.archive.rowSub', { count })} leading={tile} chevron onPress={onPress} />;
}

export function ImportCsvYouRow({ tile, onPress }: RowProps) {
  const t = useT();
  return <Row label={t('system.ownData.dataImport.title')} sublabel={t('system.ownData.dataImport.rowSub')} leading={tile} chevron onPress={onPress} />;
}

export function DiagnosticYouRow({ tile, onPress }: RowProps) {
  const t = useT();
  return <Row label={t('system.ownData.diagnostic.title')} leading={tile} chevron onPress={onPress} />;
}
