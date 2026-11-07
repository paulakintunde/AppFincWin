import { GrowHome } from '@/features/grow/home/GrowHome';

// 06-15: the Grow tab root. The tab stays hidden (TAB_AVAILABILITY.grow false, href null in the tabs layout) until plan 06-20.
export default function GrowRoute() {
  return <GrowHome />;
}
