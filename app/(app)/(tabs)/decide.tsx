import { DecideComingSoonScreen } from '@/features/decide/home/DecideComingSoonScreen';
import { HomeRoute } from '@/shell/decide/v3/HomeRoute';
import { V3Skeleton } from '@/features/decide/v3/nav/V3Skeleton';
import { useProfile } from '@/features/you/useProfile';
import { useDecideAccess } from '@/features/decide/useDecideAccess';

// D-27: the shadow export is development-only. The require sits inside the __DEV__ branch, which Metro folds away in a
// release bundle, so the module (and the data hooks it reads) never enters the release graph.
function DevShadowExport() {
  if (!__DEV__) return null;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { ShadowExportDevMenu } = require('@/features/decide/dev/ShadowExportDevMenu') as typeof import('@/features/decide/dev/ShadowExportDevMenu');
  return <ShadowExportDevMenu />;
}

// 05.3 DSV-02: a v3 account gets the v3 home; while the profile loads a skeleton (never a flash of Coming soon); everyone else keeps Coming soon.
export default function DecideRoute() {
  const access = useDecideAccess();
  const { loading } = useProfile();
  return (
    <>
      {!access.v3 ? loading ? <V3Skeleton /> : <DecideComingSoonScreen /> : <HomeRoute />}
      {__DEV__ ? <DevShadowExport /> : null}
    </>
  );
}
