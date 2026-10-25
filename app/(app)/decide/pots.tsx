import { PotsScreen } from '@/features/decide/pots/PotsScreen';
import { GoalTagEditProvider } from '@/shell/decide/GoalTagEditProvider';

// The Wait pot's decision detail and the pot sheet's Tag a transfer both write goal_id through Record's undoable edit.
export default function PotsRoute() {
  return (
    <GoalTagEditProvider>
      <PotsScreen />
    </GoalTagEditProvider>
  );
}
