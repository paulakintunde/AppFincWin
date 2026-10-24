import { PastDecisionsScreen } from '@/features/decide/past/PastDecisionsScreen';
import { GoalTagEditProvider } from '@/shell/decide/GoalTagEditProvider';

export default function PastDecisionsRoute() {
  return (
    <GoalTagEditProvider>
      <PastDecisionsScreen />
    </GoalTagEditProvider>
  );
}
