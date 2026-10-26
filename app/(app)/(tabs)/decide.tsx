import { DECIDE_OPEN } from '@/features/decide/availability';
import { DecideComingSoonScreen } from '@/features/decide/home/DecideComingSoonScreen';
import { DecideHomeScreen } from '@/features/decide/home/DecideHomeScreen';

// D-27: the shadow export is development-only. The require sits inside the __DEV__ branch, which Metro folds away in a
// release bundle, so the module (and the data hooks it reads) never enters the release graph.
function DevShadowExport() {
  if (!__DEV__) return null;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { ShadowExportDevMenu } = require('@/features/decide/dev/ShadowExportDevMenu') as typeof import('@/features/decide/dev/ShadowExportDevMenu');
  return <ShadowExportDevMenu />;
}

export default function DecideRoute() {
  return (
    <>
      {DECIDE_OPEN ? <DecideHomeScreen /> : <DecideComingSoonScreen />}
      {__DEV__ ? <DevShadowExport /> : null}
    </>
  );
}
