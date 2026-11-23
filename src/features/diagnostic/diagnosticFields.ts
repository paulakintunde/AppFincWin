/**
 * 10-17 (DAT-06): the only fields a diagnostic file may hold. The screen's "What is in it" rows and the file builder both
 * read this list, so what the person sees is what is sent. Adding a field means adding it here, giving it a row, and
 * keeping the sentinel test green.
 */
export const DIAGNOSTIC_FIELDS = [
  'appVersion',
  'buildNumber',
  'os',
  'deviceModel',
  'locale',
  'region',
  'featureLevel',
  'planState',
  'queueSize',
  'queueOldestAgeMinutes',
  'failedWrites',
  'lastSyncedAt',
  'onlineNow',
  'recentErrorCodes',
  'rowCounts',
] as const;

export type DiagnosticKey = (typeof DIAGNOSTIC_FIELDS)[number];

export interface DiagnosticRow {
  id: 'version' | 'device' | 'plan' | 'queue' | 'features' | 'errors' | 'counts';
  title: 'rowVersion' | 'rowDevice' | 'rowPlan' | 'rowQueue' | 'rowFeatures' | 'rowErrors' | 'rowCounts';
  meta: 'rowVersionMeta' | 'rowDeviceMeta' | 'rowPlanMeta' | 'rowQueueMeta' | 'rowFeaturesMeta' | 'rowErrorsMeta' | 'rowCountsMeta';
  fields: readonly DiagnosticKey[];
}

/** The rows of "What is in it". Every key of DIAGNOSTIC_FIELDS appears in exactly one row. */
export const DIAGNOSTIC_ROWS: readonly DiagnosticRow[] = [
  { id: 'version', title: 'rowVersion', meta: 'rowVersionMeta', fields: ['appVersion', 'buildNumber'] },
  { id: 'device', title: 'rowDevice', meta: 'rowDeviceMeta', fields: ['os', 'deviceModel', 'locale', 'region'] },
  { id: 'plan', title: 'rowPlan', meta: 'rowPlanMeta', fields: ['planState'] },
  {
    id: 'queue',
    title: 'rowQueue',
    meta: 'rowQueueMeta',
    fields: ['queueSize', 'queueOldestAgeMinutes', 'failedWrites', 'lastSyncedAt', 'onlineNow'],
  },
  { id: 'features', title: 'rowFeatures', meta: 'rowFeaturesMeta', fields: ['featureLevel'] },
  { id: 'errors', title: 'rowErrors', meta: 'rowErrorsMeta', fields: ['recentErrorCodes'] },
  { id: 'counts', title: 'rowCounts', meta: 'rowCountsMeta', fields: ['rowCounts'] },
];

export const SUPPORT_EMAIL = 'support@fincwin.com';
export const MAX_ERROR_CODES = 20;
