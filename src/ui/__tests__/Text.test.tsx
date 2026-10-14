import React from 'react';
import { StyleSheet } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import { Text } from '../Text';
import { TextInput } from '../TextInput';
import { FontScaleProvider, useFontScale } from '@/theme/FontScaleProvider';

const flat = (id: string) => StyleSheet.flatten(screen.getByTestId(id).props.style);

describe('Text', () => {
  it('scales body text and disables native scaling', async () => {
    await render(
      <FontScaleProvider value={3}>
        <Text testID="t" style={{ fontSize: 15, lineHeight: 22.5 }}>{'x'}</Text>
      </FontScaleProvider>,
    );
    expect(flat('t')).toMatchObject({ fontSize: 30, lineHeight: 45 });
    expect(screen.getByTestId('t').props.allowFontScaling).toBe(false);
  });
  it('caps the capped tier at 1.3', async () => {
    await render(
      <FontScaleProvider value={3}>
        <Text testID="t" scale="capped" style={{ fontSize: 10.5 }}>{'x'}</Text>
      </FontScaleProvider>,
    );
    expect(flat('t').fontSize).toBeCloseTo(13.65);
  });
  it('leaves the style unchanged at scale 1', async () => {
    await render(
      <FontScaleProvider value={1}>
        <Text testID="t" style={{ fontSize: 15 }}>{'x'}</Text>
      </FontScaleProvider>,
    );
    expect(flat('t')).toEqual({ fontSize: 15 });
  });
  it('does no scaling when the caller sets allowFontScaling false', async () => {
    await render(
      <FontScaleProvider value={3}>
        <Text testID="t" allowFontScaling={false} style={{ fontSize: 15 }}>{'x'}</Text>
      </FontScaleProvider>,
    );
    expect(flat('t')).toEqual({ fontSize: 15 });
  });
  it('gives a nested Text without fontSize no fontSize', async () => {
    await render(
      <FontScaleProvider value={2}>
        <Text testID="outer" style={{ fontSize: 15 }}>
          <Text testID="inner">{'y'}</Text>
        </Text>
      </FontScaleProvider>,
    );
    expect(flat('inner')?.fontSize).toBeUndefined();
  });
});

describe('TextInput', () => {
  it('defaults the cap to 2 and keeps a caller value', async () => {
    await render(
      <>
        <TextInput testID="a" />
        <TextInput testID="b" maxFontSizeMultiplier={1.5} />
      </>,
    );
    expect(screen.getByTestId('a').props.maxFontSizeMultiplier).toBe(2);
    expect(screen.getByTestId('b').props.maxFontSizeMultiplier).toBe(1.5);
  });
});

describe('useFontScale', () => {
  it('returns 1 outside a provider', async () => {
    let v = 0;
    function Probe() {
      v = useFontScale();
      return null;
    }
    await render(<Probe />);
    expect(v).toBe(1);
  });
});
