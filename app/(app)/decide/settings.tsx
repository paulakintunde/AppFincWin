import { SettingsRoute } from '@/shell/decide/SettingsRoute';

// 05.2-34: Decide settings. Gated per account by useDecideAccess().v3 inside SettingsRoute (D-01), so it sits outside the
// DECIDE_OPEN guard in the layout.
export default function SettingsRouteScreen() {
  return <SettingsRoute />;
}
