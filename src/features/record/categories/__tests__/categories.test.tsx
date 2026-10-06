import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import type { CategoryRow } from '@/db/rows';
import { getToast, resetToastForTests } from '@/state/undoToast';
import { CategorySheet } from '../CategorySheet';
import { RemoveCategoryPrompt } from '../RemoveCategoryPrompt';

jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.setTimeout(30000);

const mockAdd = jest.fn(() => ({ id: 'new-cat', stepId: 'add-step' }));
const mockEdit = jest.fn(() => 'edit-step');
const mockArchive = jest.fn(() => 'archive-step');
const mockRestore = jest.fn(() => 'restore-step');
const mockMerge = jest.fn(() => 'merge-step');
let mockUsage = { count: 0, capped: false, isLoading: false };

function cat(over: Partial<CategoryRow> = {}): CategoryRow {
  return {
    id: 'c1',
    owner_id: 'u1',
    builtin_key: null,
    name: 'Groceries',
    color_key: 'teal',
    is_system: false,
    archived_at: null,
    version: 2,
    updated_by: null,
    created_at: '2026-09-01T00:00:00Z',
    updated_at: '2026-09-01T00:00:00Z',
    ...over,
  };
}

const mockAll = [
  cat(),
  cat({ id: 'c2', name: 'Fuel', color_key: 'rust' }),
  cat({ id: 'c3', name: null, builtin_key: 'Dining', color_key: 'plum' }),
];

jest.mock('@/data/mutations/categories', () => ({
  useAddCategory: () => ({ add: mockAdd }),
  useEditCategory: () => ({ edit: mockEdit }),
  useArchiveCategory: () => ({ archive: mockArchive, restore: mockRestore }),
  useMergeCategory: () => ({ merge: mockMerge }),
}));
jest.mock('@/data/queries/categories', () => ({
  useCategoryLookup: () => ({ all: mockAll, active: mockAll, byId: new Map(), loading: false }),
  useCategoryUsage: () => mockUsage,
}));
jest.mock('@/features/record/useRecordContext', () => ({
  useRecordContext: () => ({ ready: true, userId: 'u1', householdId: 'h1' }),
}));

beforeEach(() => {
  jest.clearAllMocks();
  resetToastForTests();
  mockUsage = { count: 0, capped: false, isLoading: false };
});

// One render per test: a second render leaks an act() scope in this project's Jest setup.
describe('CategorySheet: new', () => {
  it('refuses an empty name and does not write', async () => {
    const onClose = jest.fn();
    const u = await render(
      <ThemeProvider>
        <CategorySheet visible mode={{ kind: 'new' }} onClose={onClose} />
      </ThemeProvider>
    );
    await fireEvent.press(u.getByText('Save category'));
    expect(u.getByText('Give the category a name.')).toBeTruthy();
    expect(mockAdd).not.toHaveBeenCalled();
  });

  it('offers exactly the 7 swatches, adds with the chosen colour and shows an Undo toast', async () => {
    const onClose = jest.fn();
    const u = await render(
      <ThemeProvider>
        <CategorySheet visible mode={{ kind: 'new' }} onClose={onClose} />
      </ThemeProvider>
    );
    expect(u.getAllByLabelText(/ colour$/)).toHaveLength(7);
    await fireEvent.changeText(u.getByLabelText('Name'), '  Pets  ');
    await fireEvent.press(u.getByLabelText('Plum colour'));
    await fireEvent.press(u.getByText('Save category'));
    expect(mockAdd).toHaveBeenCalledWith({ ownerId: 'u1', name: 'Pets', colorKey: 'plum' });
    expect(getToast()?.stepId).toBe('add-step');
    expect(getToast()?.text?.key).toBe('undo.label.categoryAdded');
    expect(onClose).toHaveBeenCalled();
  });
});

describe('CategorySheet: edit', () => {
  it('prefills a built-in with its i18n name and sends only changed fields', async () => {
    const row = mockAll[2] as CategoryRow;
    const u = await render(
      <ThemeProvider>
        <CategorySheet visible mode={{ kind: 'edit', category: row }} onClose={jest.fn()} />
      </ThemeProvider>
    );
    expect(u.getByLabelText('Name').props.value).toBe('Dining');
    await fireEvent.press(u.getByLabelText('Blue colour'));
    await fireEvent.press(u.getByText('Save changes'));
    expect(mockEdit).toHaveBeenCalledWith(row, { colorKey: 'blue' });
    expect(getToast()?.stepId).toBe('edit-step');
  });

  it('renames without touching the colour', async () => {
    const row = mockAll[0] as CategoryRow;
    const u = await render(
      <ThemeProvider>
        <CategorySheet visible mode={{ kind: 'edit', category: row }} onClose={jest.fn()} />
      </ThemeProvider>
    );
    await fireEvent.changeText(u.getByLabelText('Name'), 'Food shop');
    await fireEvent.press(u.getByText('Save changes'));
    expect(mockEdit).toHaveBeenCalledWith(row, { name: 'Food shop' });
  });

  it('closes without a write or toast when nothing changed', async () => {
    const onClose = jest.fn();
    const u = await render(
      <ThemeProvider>
        <CategorySheet visible mode={{ kind: 'edit', category: mockAll[0] as CategoryRow }} onClose={onClose} />
      </ThemeProvider>
    );
    await fireEvent.press(u.getByText('Save changes'));
    expect(mockEdit).not.toHaveBeenCalled();
    expect(getToast()).toBeNull();
    expect(onClose).toHaveBeenCalled();
  });
});

describe('RemoveCategoryPrompt', () => {
  it('archives an unused category directly', async () => {
    const onDone = jest.fn();
    await render(
      <ThemeProvider>
        <RemoveCategoryPrompt visible category={mockAll[0] as CategoryRow} onDone={onDone} onCancel={jest.fn()} />
      </ThemeProvider>
    );
    expect(mockArchive).toHaveBeenCalledTimes(1);
    expect(getToast()?.stepId).toBe('archive-step');
    expect(getToast()?.text?.key).toBe('undo.label.categoryArchived');
    expect(onDone).toHaveBeenCalled();
  });

  it('says how many transactions use it and archives on request', async () => {
    mockUsage = { count: 3, capped: false, isLoading: false };
    const onDone = jest.fn();
    const u = await render(
      <ThemeProvider>
        <RemoveCategoryPrompt visible category={mockAll[0] as CategoryRow} onDone={onDone} onCancel={jest.fn()} />
      </ThemeProvider>
    );
    expect(mockArchive).not.toHaveBeenCalled();
    expect(u.getByText(/Groceries is used by 3 transactions/)).toBeTruthy();
    await fireEvent.press(u.getByText('Archive'));
    expect(mockArchive).toHaveBeenCalledTimes(1);
    expect(onDone).toHaveBeenCalled();
  });

  it('merges into a picked target, excluding the source, and shows the merged toast', async () => {
    mockUsage = { count: 3, capped: false, isLoading: false };
    const onDone = jest.fn();
    const u = await render(
      <ThemeProvider>
        <RemoveCategoryPrompt visible category={mockAll[0] as CategoryRow} onDone={onDone} onCancel={jest.fn()} />
      </ThemeProvider>
    );
    await fireEvent.press(u.getByText('Merge'));
    expect(u.getByText('Merge Groceries into')).toBeTruthy();
    expect(u.queryByText('Groceries')).toBeNull();
    await fireEvent.press(u.getByText('Fuel'));
    expect(mockMerge).toHaveBeenCalledWith({
      source: mockAll[0],
      target: mockAll[1],
      targetName: 'Fuel',
      householdId: 'h1',
      ownerId: 'u1',
    });
    expect(getToast()?.stepId).toBe('merge-step');
    expect(getToast()?.text?.key).toBe('undo.label.categoryMerged');
    expect(onDone).toHaveBeenCalled();
  });

  it('disables Merge and Archive while usage is loading', async () => {
    mockUsage = { count: 0, capped: false, isLoading: true };
    const u = await render(
      <ThemeProvider>
        <RemoveCategoryPrompt visible category={mockAll[0] as CategoryRow} onDone={jest.fn()} onCancel={jest.fn()} />
      </ThemeProvider>
    );
    expect(mockArchive).not.toHaveBeenCalled();
    expect(u.getByLabelText('Merge').props.accessibilityState.disabled).toBe(true);
    expect(u.getByLabelText('Archive').props.accessibilityState.disabled).toBe(true);
  });

  it('disables Merge when the count is capped (the merge would be refused) but still allows Archive', async () => {
    mockUsage = { count: 6000, capped: true, isLoading: false };
    const u = await render(
      <ThemeProvider>
        <RemoveCategoryPrompt visible category={mockAll[0] as CategoryRow} onDone={jest.fn()} onCancel={jest.fn()} />
      </ThemeProvider>
    );
    expect(u.getByLabelText('Merge').props.accessibilityState.disabled).toBe(true);
    expect(u.getByLabelText('Archive').props.accessibilityState.disabled).toBe(false);
  });
});
