import React from "react";
import { StyleSheet, Text } from "react-native";
import { act, fireEvent, render, within } from "@testing-library/react-native";
import { getAnimatedStyle } from "react-native-reanimated";
import { ThemeProvider } from "@/theme/ThemeProvider";
import { colors } from "@/theme/tokens";
import { DURATION } from "@/theme/motion";
import { Sheet } from "../Sheet";
import { BACKDROP_OPACITY } from "../sheetDrag";

jest.setTimeout(20000);

jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 10, left: 0, right: 0 }),
}));

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe("Sheet backdrop", () => {
  it("fills with colors.ink, settles at 0.38 after the fade and dismisses on tap", async () => {
    const onDismiss = jest.fn();
    const screen = await render(
      <ThemeProvider>
        <Sheet visible onDismiss={onDismiss}>
          <Text>{"Body"}</Text>
        </Sheet>
      </ThemeProvider>,
    );
    const fill = screen.getByTestId("sheet-backdrop-fill");
    expect(StyleSheet.flatten(fill.props.style).backgroundColor).toBe(colors.ink);
    await act(async () => {
      jest.advanceTimersByTime(DURATION.backdrop + 50);
    });
    expect(getAnimatedStyle(fill).opacity).toBeCloseTo(BACKDROP_OPACITY, 2);
    const backdrop = screen.getByTestId("sheet-backdrop");
    expect(backdrop.props.accessibilityRole).toBe("button");
    await fireEvent.press(backdrop);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("has no scrim colour token", () => {
    expect(Object.keys(colors)).not.toContain("scrim");
  });

  it("keeps the backdrop outside the animated sheet container", async () => {
    const screen = await render(
      <ThemeProvider>
        <Sheet visible onDismiss={jest.fn()}>
          <Text>{"Body"}</Text>
        </Sheet>
      </ThemeProvider>,
    );
    const container = screen.getByTestId("sheet-container");
    expect(() => within(container).getByTestId("sheet-backdrop")).toThrow();
  });
});
