import { DECIDE_OPEN } from '@/features/decide/availability';
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

// 05.2 D-18: a test account (the per-account switch on) gets the setup page and engine readout; everyone else keeps today's tab.
export default function DecideRoute() {
  const access = useDecideAccess();
  return (
    <>
      {DECIDE_OPEN ? <DecideHomeScreen /> : access.v3 ? <DecideSetupPage /> : <DecideComingSoonScreen />}
      {__DEV__ ? <DevShadowExport /> : null}
    </>
  );
}
