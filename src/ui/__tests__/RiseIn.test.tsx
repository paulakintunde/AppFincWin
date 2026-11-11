import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import { RISE_IN_ANIMATED, RiseIn } from '../RiseIn';

let mockReduced = false;
jest.mock('@/theme/motion', () => ({
  ...jest.requireActual('@/theme/motion'),
  useMotion: () => ({ reduced: mockReduced, duration: (ms: number) => (mockReduced ? 0 : ms), easing: undefined }),
}));

describe('RiseIn (05.2-50 F-01)', () => {
  beforeEach(() => {
    mockReduced = false;
  });

  it('is animated by default', () => {
    expect(RISE_IN_ANIMATED).toBe(true);
  });

  it('reduced motion: a plain View with no opacity and no entering', async () => {
    mockReduced = true;
    await render(
      <RiseIn style={{ gap: 4 }}>
        <Text>{'body'}</Text>
      </RiseIn>
    );
    const view = screen.getByText('body').parent!;
    expect(view.props.entering).toBeUndefined();
    expect(StyleSheet.flatten(view.props.style) ?? {}).not.toHaveProperty('opacity');
  });

  it('animated: has an entering prop and no opacity in the resting style', async () => {
    await render(
      <RiseIn style={{ gap: 4 }}>
        <Text>{'body'}</Text>
      </RiseIn>
    );
    const view = screen.getByText('body').parent!;
    expect(view.props.entering).toBeDefined();
    expect(StyleSheet.flatten(view.props.style)).not.toHaveProperty('opacity');
  });

  it('re-rendering with new children keeps them rendered and the style free of opacity', async () => {
    const { rerender } = await render(
      <RiseIn>
        <Text>{'first'}</Text>
      </RiseIn>
    );
    await rerender(
      <RiseIn>
        <Text>{'second'}</Text>
      </RiseIn>
    );
    expect(screen.getByText('second')).toBeTruthy();
    const view = screen.getByText('second').parent!;
    expect(StyleSheet.flatten(view.props.style) ?? {}).not.toHaveProperty('opacity');
  });

  it('contingency: animated={false} renders a plain View with no entering', async () => {
    await render(
      <RiseIn animated={false} style={{ gap: 4 }}>
        <Text>{'body'}</Text>
      </RiseIn>
    );
    const view = screen.getByText('body').parent!;
    expect(view.props.entering).toBeUndefined();
    expect(StyleSheet.flatten(view.props.style) ?? {}).not.toHaveProperty('opacity');
  });
});
