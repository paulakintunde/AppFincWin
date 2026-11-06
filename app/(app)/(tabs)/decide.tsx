import { DECIDE_OPEN, DECIDE_SETUP_VISIBLE } from '@/features/decide/availability';
import { DecideComingSoonScreen } from '@/features/decide/home/DecideComingSoonScreen';
import { DecideHomeScreen } from '@/features/decide/home/DecideHomeScreen';
import { DecideSetupPage } from '@/features/decide/setup/DecideSetupPage';
import { useDecideAccess } from '@/features/decide/useDecideAccess';

// D-27: the shadow export is development-only. The require sits inside the __DEV__ branch, which Metro folds away in a
// release bundle, so the module (and the data hooks it reads) never enters the release graph.
function DevShadowExport() {
  if (!__DEV__) return null;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { ShadowExportDevMenu } = require('@/features/decide/dev/ShadowExportDevMenu') as typeof import('@/features/decide/dev/ShadowExportDevMenu');
  return <ShadowExportDevMenu />;
}

// 05.4 BO-06: the setup page and engine readout are hidden from every account, whatever the per-account switch says.
export default function DecideRoute() {
  const access = useDecideAccess();
  return (
    <>
      {DECIDE_OPEN ? <DecideHomeScreen /> : DECIDE_SETUP_VISIBLE && access.v3 ? <DecideSetupPage /> : <DecideComingSoonScreen />}
      {__DEV__ ? <DevShadowExport /> : null}
    </>
  );
}
