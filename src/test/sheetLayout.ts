// 06.1-81 (G-78-2): a Sheet's backdrop takes taps only once its panel has laid out in the Modal's window. The test renderer never
// lays anything out, so a test that presses a backdrop first reports the panel's layout, as the device does when the sheet shows.
import { act, fireEvent, screen } from '@testing-library/react-native';

/** Fires the first layout of every open sheet panel (sheet-container) that is on screen now. */
export async function layOutSheets(height = 400): Promise<void> {
  const panels = screen.queryAllByTestId('sheet-container', { hidden: true });
  await act(async () => {
    for (const panel of panels) fireEvent(panel, 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 400, height } } });
  });
}
