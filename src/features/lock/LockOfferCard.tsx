// 10-21 (UI-SPEC 1a, D-01, D-33): the one-time Home card that offers the lock. It shows after first setup while the lock
// is off and the offer is unanswered. "Turn on" opens the setup sheet; "Not now" answers it. Either removes the card for
// good, and nothing nags afterwards.
import React, { useCallback, useEffect, useState } from 'react';
import { useT } from '@/i18n';
import { useUserSetup } from '@/features/levels/useUserSetup';
import { NoticeCard } from '@/features/plans/components/NoticeCard';
import { biometricKind, deviceLockAvailable, type BiometricKind } from '@/services/lock/biometric';
import { loadLockState, saveLockSettings } from '@/services/lock/lockStore';
import { LockSetupSheet } from './LockSetupSheet';
import { notifyLockChanged, subscribeLockChanged } from './lockEvents';

interface OfferState {
  enabled: boolean;
  answered: boolean;
  kind: BiometricKind;
  deviceLock: boolean;
}

export function LockOfferCard(): React.JSX.Element | null {
  const t = useT();
  const setup = useUserSetup();
  const [offer, setOffer] = useState<OfferState | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const load = useCallback(async () => {
    const [state, kind, deviceLock] = await Promise.all([loadLockState(), biometricKind(), deviceLockAvailable()]);
    setOffer({ enabled: state.settings.enabled, answered: state.settings.offerAnswered, kind, deviceLock });
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reads the phone's lock settings once on mount
    void load();
    return subscribeLockChanged(() => void load());
  }, [load]);

  const setupDone = setup.data?.completedAt != null;
  const showCard = setupDone && offer !== null && !offer.enabled && !offer.answered;
  // The sheet outlives the card: it stays up on "Lock is on" even though the card has already gone.
  if (!showCard && !sheetOpen) return null;

  const kind = offer?.kind ?? 'none';
  const title = !offer?.deviceLock
    ? t('system.appLock.offerTitlePin')
    : kind === 'faceId'
      ? t('system.appLock.offerTitleFaceId')
      : kind === 'touchId'
        ? t('system.appLock.offerTitleTouchId')
        : t('system.appLock.offerTitleDevice');
  const body = offer?.deviceLock ? t('system.appLock.offerBody') : t('system.appLock.offerBodyPin');

  return (
    <>
      {showCard ? (
        <NoticeCard
          testID="lock-offer"
          title={title}
          body={body}
          actions={[
            { kind: 'primary', label: t('system.appLock.offerTurnOn'), onPress: () => setSheetOpen(true), testID: 'lock-offer-on' },
            {
              kind: 'link',
              label: t('system.appLock.offerNotNow'),
              testID: 'lock-offer-later',
              onPress: () => {
                void saveLockSettings({ offerAnswered: true }).then(() => {
                  notifyLockChanged();
                  return load();
                });
              },
            },
          ]}
        />
      ) : null}
      <LockSetupSheet visible={sheetOpen} onClose={() => setSheetOpen(false)} />
    </>
  );
}
