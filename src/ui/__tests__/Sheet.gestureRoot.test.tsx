import React from "react";
import { Text } from "react-native";
import { render } from "@testing-library/react-native";
import { ThemeProvider } from "@/theme/ThemeProvider";
import { Sheet } from "../Sheet";

jest.setTimeout(20000);

jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 10, left: 0, right: 0 }),
}));

describe("Sheet gesture root", () => {
  it("wraps the Modal content in its own GestureHandlerRootView so swipes work on Android", async () => {
    const screen = await render(
      <ThemeProvider>
        <Sheet visible onDismiss={jest.fn()}>
          <Text>{"Body"}</Text>
        </Sheet>
      </ThemeProvider>,
    );
    const root = screen.getByTestId("sheet-gesture-root");
    expect(root).toBeTruthy();
    expect(screen.getByTestId("sheet-container")).toBeTruthy();
  });
});
