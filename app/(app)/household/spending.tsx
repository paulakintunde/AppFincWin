import { useLocalSearchParams } from 'expo-router';
import { SpendRuleScreen } from '@/features/household/rules/SpendRuleScreen';
import { suggestTargetOf, type SuggestionTarget } from '@/features/household/rules/zeroShareSuggestion';

// 08.1-25: ?suggest=<target> opens the set-shares editor pre-filled with that suggestion; an unknown value is ignored.
export default function HouseholdSpendingRoute() {
  const params = useLocalSearchParams<{ suggest?: string | string[] }>();
  const suggest = suggestTargetOf(params.suggest) as SuggestionTarget | undefined;
  return <SpendRuleScreen suggest={suggest} />;
}
