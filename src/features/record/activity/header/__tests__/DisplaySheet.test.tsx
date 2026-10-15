import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { ACTIVITY_VIEWS, type ActivityView } from '../../activityViewPrefs';
import type { SortKey } from '@/engine/activity';
import { DisplayChip } from '../DisplayChip';
import { DisplaySheet } from '../DisplaySheet';

jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.setTimeout(30000);

async function openSheet(view: ActivityView = 'list', sort: SortKey = 'newest') {
  const fns = { onClose: jest.fn(), onViewChange: jest.fn(), onSortChange: jest.fn() };
  const utils = await render(
    <ThemeProvider>
      <DisplaySheet visible views={ACTIVITY_VIEWS} view={view} sort={sort} {...fns} />
    </ThemeProvider>
  );
  return { ...utils, ...fns };
}

describe('DisplayChip', () => {
  async function chip(view: ActivityView, sort: SortKey, onPress = jest.fn()) {
    const utils = await render(
      <ThemeProvider>
        <DisplayChip view={view} sort={sort} onPress={onPress} />
      </ThemeProvider>
    );
    return { ...utils, onPress };
  }

  it('reads view and sort', async () => {
    const { getByText, getByLabelText } = await chip('list', 'newest');
    expect(getByText('By day · Newest')).toBeTruthy();
    expect(getByLabelText('By day · Newest, display options')).toBeTruthy();
  });

  it('uses the full balance name', async () => {
    const { getByText } = await chip('balance', 'oldest');
    expect(getByText('Running balance · Oldest')).toBeTruthy();
  });

  it('shows only Calendar in Calendar', async () => {
    const { getByText, getByLabelText, queryByTestId } = await chip('calendar', 'newest');
    expect(getByText('Calendar')).toBeTruthy();
    expect(getByLabelText('Calendar, display options')).toBeTruthy();
    expect(queryByTestId('accent-tint')).toBeNull();
  });

  it('calls onPress once', async () => {
    const { getByLabelText, onPress } = await chip('list', 'newest');
    await fireEvent.press(getByLabelText('By day · Newest, display options'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

describe('DisplaySheet', () => {
  it('lists the View and Sort by sections', async () => {
    const { getByText, getByLabelText } = await openSheet();
    expect(getByText('View')).toBeTruthy();
    expect(getByText('Sort by')).toBeTruthy();
    expect(getByLabelText('By day, Everything together, newest first')).toBeTruthy();
    expect(getByLabelText('Calendar, Due dates on a grid')).toBeTruthy();
    for (const s of ['Newest', 'Oldest', 'Biggest', 'Smallest', 'A – Z']) expect(getByText(s)).toBeTruthy();
  });

  it('marks the selected view and sort', async () => {
    const { getByLabelText } = await openSheet();
    expect(getByLabelText('By day, Everything together, newest first').props.accessibilityState).toEqual({
      selected: true,
    });
    expect(getByLabelText('By week, Calendar weeks of the month').props.accessibilityState).toEqual({
      selected: false,
    });
    expect(getByLabelText('Newest').props.accessibilityState).toEqual({ selected: true });
    expect(getByLabelText('Oldest').props.accessibilityState).toEqual({ selected: false });
  });

  it('applies a view without closing', async () => {
    const { getByLabelText, onViewChange, onClose } = await openSheet();
    await fireEvent.press(getByLabelText('By week, Calendar weeks of the month'));
    expect(onViewChange).toHaveBeenCalledWith('week');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('applies a sort without closing', async () => {
    const { getByLabelText, onSortChange, onClose } = await openSheet();
    await fireEvent.press(getByLabelText('Biggest'));
    expect(onSortChange).toHaveBeenCalledWith('biggest');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('hides Sort by in Calendar', async () => {
    const { queryByText } = await openSheet('calendar');
    expect(queryByText('Sort by')).toBeNull();
    expect(queryByText('Biggest')).toBeNull();
  });

  it('closes on Done', async () => {
    const { getByText, onClose } = await openSheet();
    await fireEvent.press(getByText('Done'));
    expect(onClose).toHaveBeenCalled();
  });
});
