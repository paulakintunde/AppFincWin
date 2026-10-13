import React from "react";
import { StyleSheet, Text } from "react-native";
import { fireEvent, render, within } from "@testing-library/react-native";
import { ThemeProvider } from "@/theme/ThemeProvider";
import { colors } from "@/theme/tokens";
import { Sheet } from "../Sheet";

jest.setTimeout(20000);

jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 10, left: 0, right: 0 }),
}));

describe("Sheet scrim", () => {
  it("colours the backdrop with colors.scrim and dismisses on tap", async () => {
    const onDismiss = jest.fn();
    const screen = await render(
      <ThemeProvider>
        <Sheet visible onDismiss={onDismiss}>
          <Text>{"Body"}</Text>
        </Sheet>
      </ThemeProvider>,
    );
    const backdrop = screen.getByTestId("sheet-backdrop");
    expect(StyleSheet.flatten(backdrop.props.style).backgroundColor).toBe(colors.scrim);
    await fireEvent.press(backdrop);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("is a semi-transparent black", () => {
    expect(colors.scrim).toMatch(/^rgba\(0,\s*0,\s*0,\s*0?\.\d+\)$/);
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
