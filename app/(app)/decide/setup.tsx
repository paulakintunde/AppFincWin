import { SetupRoute } from '@/shell/decide/SetupRoute';

// 05.2-32: Decide setup. Gated per account by useDecideAccess().v3 inside SetupRoute (D-01), so it sits outside the
// DECIDE_OPEN guard in the layout.
export default function SetupRouteScreen() {
  return <SetupRoute />;
}
