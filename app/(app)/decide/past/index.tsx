import { PastDecisionsScreen } from '@/features/decide/screens/past/PastDecisionsScreen';
import { GoalTagEditProvider } from '@/shell/decide/GoalTagEditProvider';

export default function PastDecisionsRoute() {
  return (
    <GoalTagEditProvider>
      <PastDecisionsScreen />
    </GoalTagEditProvider>
  );
}
