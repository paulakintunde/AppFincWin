/** 05.3-23: CheckCard. */
import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import { wrap } from '../../../check/steps/__tests__/helpers/stepProps';
import { CheckCard } from '../CheckCard';

jest.setTimeout(60000);

const mockOpen = jest.fn();
jest.mock('../../nav/hrefs', () => ({ ...jest.requireActual('../../nav/hrefs'), openV3NewCheck: () => mockOpen() }));

describe('CheckCard', () => {
  it('shows the heading, body and one button that opens a new check once', async () => {
    mockOpen.mockClear();
    await wrap(<CheckCard />);
    expect(screen.getByText('Thinking of buying something?')).toBeTruthy();
    expect(screen.getByText('See what it does to your month before you spend.')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Check a purchase' }));
    expect(mockOpen).toHaveBeenCalledTimes(1);
  });

  it('calls a supplied handler instead', async () => {
    const onCheck = jest.fn();
    await wrap(<CheckCard onCheck={onCheck} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Check a purchase' }));
    expect(onCheck).toHaveBeenCalledTimes(1);
  });
});
