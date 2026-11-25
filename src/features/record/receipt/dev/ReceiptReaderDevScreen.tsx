// 10.1-02 (D-22): development-only. Reads chosen images on the phone and saves the text lines with their positions as
// JSON for the receipt corpus. Dev strings are English on purpose; the route redirects away when __DEV__ is false.
// Nothing here is sent anywhere: the dump stays in the app sandbox (pulled by adb only, T-10.1-02-04).
import { useState } from 'react';
import { View } from 'react-native';
import { File, Paths } from 'expo-file-system';
import { getDocumentAsync } from 'expo-document-picker';
import { prepareImage } from '@/services/receipts/compress';
import { pickPhoto } from '@/services/receipts/pickPhoto';
import { readOnDevice } from '@/services/receipts/readOnDevice';
import { scanDocument } from '@/services/receipts/scanDocument';
import type { OcrResult, PickResult } from '@/services/receipts/types';
import { space } from '@/theme/layout';
import { Pill } from '@/ui/Pill';
import { Screen } from '@/ui/Screen';
import { Text } from '@/ui/Text';

const DUMP_NAME = 'ocr-dumps.json';
// Dev-only string held in a constant so the JSX-literal lint rule (DSG-04) stays on for the rest of the file.
const DEV_TITLE = 'Receipt reader (development only)';

interface DumpRecord {
  name: string;
  ocr: OcrResult;
  ms: number;
}

function baseName(label: string): string {
  const slash = Math.max(label.lastIndexOf('/'), label.lastIndexOf('\\'));
  const leaf = label.slice(slash + 1);
  const dot = leaf.lastIndexOf('.');
  return dot > 0 ? leaf.slice(0, dot) : leaf;
}

function describe(result: PickResult): string {
  if (!result.ok) return `failed: ${result.reason}`;
  return `${result.kind}: ${result.files.length} file(s), bytes ${result.files.map((f) => f.bytes).join(', ')}`;
}

export function ReceiptReaderDevScreen() {
  const [status, setStatus] = useState('Idle');
  const [busy, setBusy] = useState(false);

  async function readBatch(): Promise<void> {
    setBusy(true);
    try {
      const picked = await getDocumentAsync({ type: ['image/*'], multiple: true, copyToCacheDirectory: true });
      if (picked.canceled) {
        setStatus('Cancelled');
        return;
      }
      const records: DumpRecord[] = [];
      let failed = 0;
      for (const asset of picked.assets) {
        const started = Date.now();
        const prepared = await prepareImage(asset.uri);
        if (!prepared.ok) {
          failed += 1;
          continue;
        }
        const read = await readOnDevice(prepared.file.uri);
        if (!read.ok) {
          failed += 1;
          continue;
        }
        records.push({ name: baseName(asset.name), ocr: read.result, ms: Date.now() - started });
      }
      const file = new File(Paths.document, DUMP_NAME);
      if (!file.exists) file.create();
      file.write(JSON.stringify(records, null, 2));
      setStatus(`${records.length} read, ${failed} failed`);
    } catch {
      setStatus('Batch failed');
    } finally {
      setBusy(false);
    }
  }

  async function tryPick(run: () => Promise<PickResult>): Promise<void> {
    setBusy(true);
    try {
      setStatus(describe(await run()));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen scroll>
      <View style={{ padding: space.screenH, gap: space.gapSm }}>
        <Text>{DEV_TITLE}</Text>
        <Text>{status}</Text>
        <Pill label="Pick images" variant="primary" disabled={busy} onPress={() => void readBatch()} />
        <Pill label="Try camera" variant="secondary" disabled={busy} onPress={() => void tryPick(() => pickPhoto('camera'))} />
        <Pill label="Try gallery" variant="secondary" disabled={busy} onPress={() => void tryPick(() => pickPhoto('library'))} />
        <Pill label="Try scan" variant="secondary" disabled={busy} onPress={() => void tryPick(() => scanDocument())} />
      </View>
    </Screen>
  );
}
