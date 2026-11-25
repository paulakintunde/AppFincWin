// 07-11: the Insights tab root. Visible from Everyday (level 2) through GatedTabBar (D-16). One run of Decide's reads for the screen.
import { DecideV3Scope } from '@/data/queries/decideV3';
import { InsightsScreen } from '@/features/insights/InsightsScreen';

export default function InsightsRoute() {
  return (
    <DecideV3Scope>
      <InsightsScreen />
    </DecideV3Scope>
  );
}
