// 05.5-09 (APP-12, T-05.5-09-01): Decide breadcrumbs. A fixed event list and nothing else: no data object, no free text, so an
// amount, an item name or an id can never ride along. The SDK's beforeBreadcrumb hook (errorReporter.ts) still scrubs the message.
// Sentry.addBreadcrumb is a no-op until the reporter has initialised the SDK.
import * as Sentry from '@sentry/react-native';

export type DecideEvent = 'check_started' | 'answer_shown' | 'engine_error' | 'setup_item_opened';

export function decideBreadcrumb(event: DecideEvent): void {
  Sentry.addBreadcrumb({ category: 'decide', message: event });
}
