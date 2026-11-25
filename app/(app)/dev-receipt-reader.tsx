import { Redirect } from 'expo-router';
import { ReceiptReaderDevScreen } from '@/features/record/receipt/dev/ReceiptReaderDevScreen';

// 10.1-02 (D-22): development builds only; release builds go home.
export default function DevReceiptReaderRoute() {
  if (!__DEV__) return <Redirect href="/" />;
  return <ReceiptReaderDevScreen />;
}
