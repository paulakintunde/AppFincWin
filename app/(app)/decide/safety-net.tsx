import React from 'react';
import { SafetyNetRoute } from '@/shell/decide/SafetyNetRoute';

// 06.1-18 (D51): Decide's safety-net settings. Thin: the route body binds the writes and applies the decide_v3 gate.
export default function SafetyNetRouteScreen(): React.JSX.Element {
  return <SafetyNetRoute />;
}
