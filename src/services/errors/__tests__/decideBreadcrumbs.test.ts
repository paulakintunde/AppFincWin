import { assert as fcAssert, constantFrom, property } from 'fast-check';
import * as Sentry from '@sentry/react-native';
import { decideBreadcrumb, type DecideEvent } from '../decideBreadcrumbs';

jest.mock('@sentry/react-native', () => ({ addBreadcrumb: jest.fn() }));

const add = Sentry.addBreadcrumb as jest.Mock;
beforeEach(() => add.mockClear());

describe('decideBreadcrumb (APP-12)', () => {
  it('adds category decide and the event as the message, with no data object', () => {
    decideBreadcrumb('check_started');
    expect(add).toHaveBeenCalledTimes(1);
    expect(add).toHaveBeenCalledWith({ category: 'decide', message: 'check_started' });
    expect(Object.keys(add.mock.calls[0]![0] as object).sort()).toEqual(['category', 'message']);
  });

  it('only the four fixed events type-check', () => {
    const ok: DecideEvent[] = ['check_started', 'answer_shown', 'engine_error', 'setup_item_opened'];
    // @ts-expect-error free text is not an event
    const bad: DecideEvent = 'bought a sofa for 1200';
    expect(ok).toHaveLength(4);
    expect(typeof bad).toBe('string');
  });

  it('for every event the breadcrumb message has no 2+ digit run and no currency symbol, and only category and message are sent', () => {
    fcAssert(
      property(constantFrom<DecideEvent>('check_started', 'answer_shown', 'engine_error', 'setup_item_opened'), (event) => {
        add.mockClear();
        decideBreadcrumb(event);
        const sent = add.mock.calls[0]![0] as Record<string, unknown>;
        return sent.message === event && sent.category === 'decide' && Object.keys(sent).length === 2 && !/\d{2,}|[$£€¥]/.test(String(sent.message));
      })
    );
  });
});
