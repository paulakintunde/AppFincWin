// D-27: development-only. Never reachable in release: mounted behind __DEV__ in the Decide tab route, and it renders null and
// registers nothing when __DEV__ is false. It has no screen, route or visible text; the menu label is a developer string.
import { useEffect } from 'react';
import { DevSettings } from 'react-native';
import { File, Paths } from 'expo-file-system';
import { useDecideChecks, useDecideSnapshot } from '@/data/queries/decide';
import { useRecordContext } from '@/features/record/useRecordContext';
import { serializeShadowSource, type ShadowExportArgs } from './shadowExport';

const FILE_NAME = 'shadow-source.local.json';
const APP_ID = 'com.fincwin.app';

// L-08: DevSettings has no remove API, so the item is registered once per app run. The handler reads the latest export
// arguments through this module-level ref, which every render of the registrar updates, so a remount uses fresh data.
let registered = false;
const latest: { current: ShadowExportArgs | null } = { current: null };

/** Test seam: forget the registration so a test can register again. */
export function resetDevMenuRegistration(): void {
  registered = false;
  latest.current = null;
}

function exportNow(): void {
  const args = latest.current;
  if (args === null) {
    console.log('Decide shadow export: the snapshot is not ready yet');
    return;
  }
  const file = new File(Paths.document, FILE_NAME);
  if (!file.exists) file.create();
  file.write(serializeShadowSource(args));
  console.log(`Decide shadow source written to ${file.uri}`);
  console.log(`Fetch it: adb exec-out run-as ${APP_ID} cat files/${FILE_NAME} > ${FILE_NAME}`);
}

function ShadowExportRegistrar() {
  const rc = useRecordContext();
  const { source } = useDecideSnapshot();
  const checks = useDecideChecks(rc.userId ?? undefined, rc.householdId ?? undefined).data;
  const householdId = rc.householdId;
  const today = rc.today;
  useEffect(() => {
    // v3Settings stays null: 05.2 has no v3 settings storage yet (L-08 remainder, 05.3 list)
    latest.current = source !== null && checks !== undefined && householdId !== null ? { source, v3Settings: null, checks, householdId, today } : null;
  }, [source, checks, householdId, today]);

  useEffect(() => {
    if (registered) return;
    registered = true;
    DevSettings.addMenuItem('Export Decide shadow source', exportNow);
  }, []);
  return null;
}

export function ShadowExportDevMenu() {
  return __DEV__ ? <ShadowExportRegistrar /> : null;
}
