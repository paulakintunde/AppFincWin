// 09-25 A7 (TalkBack device check, Pixel 6): focus started on "1 of 11" and did not move after Continue or Skip. Each new
// question now moves screen-reader focus to its heading, and the heading also says which question it is.
import React from 'react';
import { AccessibilityInfo, Text } from 'react-native';
import { render } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { QuestionScreen } from '../QuestionScreen';

jest.setTimeout(30000);

jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 47, bottom: 12, left: 0, right: 0 }),
}));

const noop = () => undefined;

function screen(n: number, title: string) {
  return (
    <ThemeProvider>
      <QuestionScreen
        progress={{ n, total: 11 }}
        title={title}
        canGoBack={n > 1}
        canContinue
        onBack={noop}
        onContinue={noop}
        onSkip={noop}
        onSkipRest={noop}
        stepKey={`q${n}`}
      >
        <Text>options</Text>
      </QuestionScreen>
    </ThemeProvider>
  );
}

describe('QuestionScreen screen-reader focus', () => {
  it('the heading names the question number on each new question (the focus move itself needs a native handle: device check)', async () => {
    const focus = jest.spyOn(AccessibilityInfo, 'setAccessibilityFocus').mockImplementation(() => undefined);
    const view = await render(screen(1, 'Where do you live?'));
    expect(view.getByRole('header').props.accessibilityLabel).toMatch(/^Where do you live\?\. .*1.*11/);

    await view.rerender(screen(2, 'Which currency?'));
    expect(view.getByRole('header').props.accessibilityLabel).toMatch(/^Which currency\?\. .*2.*11/);
    focus.mockRestore();
  });
});
