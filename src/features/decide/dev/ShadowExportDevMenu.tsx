// D-27: development-only. Never reachable in release: mounted behind __DEV__ in the Decide tab route, and it renders null and
// registers nothing when __DEV__ is false. It has no screen, route or visible text; the menu label is a developer string.
import { useEffect, useRef } from 'react';
import { DevSettings } from 'react-native';
import { File, Paths } from 'expo-file-system';
import { useDecideChecks, useDecideSnapshot } from '@/data/queries/decide';
import { useRecordContext } from '@/features/record/useRecordContext';
import { serializeShadowSource, type ShadowExportArgs } from './shadowExport';

const FILE_NAME = 'shadow-source.local.json';
const APP_ID = 'com.fincwin.app';

function ShadowExportRegistrar() {
  const rc = useRecordContext();
  const { source } = useDecideSnapshot();
  const checks = useDecideChecks(rc.userId ?? undefined, rc.householdId ?? undefined).data;
  const latest = useRef<ShadowExportArgs | null>(null);
  const householdId = rc.householdId;
  const today = rc.today;
  useEffect(() => {
    latest.current =
      source !== null && checks !== undefined && householdId !== null
        ? { source, v3Settings: null, checks, householdId, today }
        : null;
  }, [source, checks, householdId, today]);

  useEffect(() => {
    DevSettings.addMenuItem('Export Decide shadow source', () => {
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
    });
  }, []);
  return null;
}

export function ShadowExportDevMenu() {
  return __DEV__ ? <ShadowExportRegistrar /> : null;
}
