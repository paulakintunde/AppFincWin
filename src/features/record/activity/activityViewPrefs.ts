// The Activity view and sort a person last chose, remembered on the device (UI-SPEC 1).
// The key starts with `fincwin:` so wipeDeviceData() clears it on sign-out (T-02.2-24-01).
// Stored values are validated against fixed lists; anything else falls back to the default.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SORT_KEYS, type SortKey } from '@/engine/activity';
import type { ActivityListView } from './activitySections';

export const ACTIVITY_VIEW_KEY = 'fincwin:activity-view';

export type ActivityView = ActivityListView | 'calendar';

export const ACTIVITY_VIEWS: readonly ActivityView[] = ['list', 'week', 'split', 'balance', 'calendar'];

export interface ActivityViewPrefs {
  view: ActivityView;
  sort: SortKey;
}

export const DEFAULT_VIEW_PREFS: ActivityViewPrefs = { view: 'list', sort: 'newest' };

export async function loadViewPrefs(): Promise<ActivityViewPrefs> {
  try {
    const raw = await AsyncStorage.getItem(ACTIVITY_VIEW_KEY);
    if (!raw) return DEFAULT_VIEW_PREFS;
    const parsed = JSON.parse(raw) as Record<string, unknown> | null;
    const view = parsed?.view;
    const sort = parsed?.sort;
    return {
      view: ACTIVITY_VIEWS.find((v) => v === view) ?? DEFAULT_VIEW_PREFS.view,
      sort: SORT_KEYS.find((s) => s === sort) ?? DEFAULT_VIEW_PREFS.sort,
    };
  } catch {
    return DEFAULT_VIEW_PREFS;
  }
}

export async function saveViewPrefs(prefs: ActivityViewPrefs): Promise<void> {
  try {
    await AsyncStorage.setItem(ACTIVITY_VIEW_KEY, JSON.stringify(prefs));
  } catch {
    // A preference that cannot be saved is not worth interrupting the screen for.
  }
}
