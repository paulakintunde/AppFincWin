import { DECIDE_OPEN } from '@/features/decide/availability';
import { ShadowExportDevMenu } from '@/features/decide/dev/ShadowExportDevMenu';
import { DecideComingSoonScreen } from '@/features/decide/home/DecideComingSoonScreen';
import { DecideHomeScreen } from '@/features/decide/home/DecideHomeScreen';

export default function DecideRoute() {
  return (
    <>
      {DECIDE_OPEN ? <DecideHomeScreen /> : <DecideComingSoonScreen />}
      {__DEV__ ? <ShadowExportDevMenu /> : null}
    </>
  );
}
