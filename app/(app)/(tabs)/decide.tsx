import { DECIDE_OPEN } from '@/features/decide/availability';
import { DecideHome } from '@/features/decide/screens/home/DecideHome';

// D-27: the shadow export is development-only. The require sits inside the __DEV__ branch, which Metro folds away in a
// release bundle, so the module (and the data hooks it reads) never enters the release graph.
function DevShadowExport() {
  if (!__DEV__) return null;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { ShadowExportDevMenu } = require('@/features/decide/dev/ShadowExportDevMenu') as typeof import('@/features/decide/dev/ShadowExportDevMenu');
  return <ShadowExportDevMenu />;
}

// 06.1-21 (D-05): one Decide in the routes. The tab shows the new home; the old home, coming-soon and setup pages are no longer mounted here.
export default function DecideRoute() {
  return (
    <>
      {DECIDE_OPEN ? <DecideHome /> : null}
      {__DEV__ ? <DevShadowExport /> : null}
    </>
  );
}
