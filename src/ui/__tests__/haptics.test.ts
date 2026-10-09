import * as Haptics from 'expo-haptics';

import { hapticLight, hapticSelection, hapticSuccess, hapticWarning } from '../haptics';

const impact = Haptics.impactAsync as jest.Mock;
const selection = Haptics.selectionAsync as jest.Mock;
const notification = Haptics.notificationAsync as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('haptics wrapper', () => {
  it('hapticLight fires a light impact once', () => {
    hapticLight();
    expect(impact).toHaveBeenCalledTimes(1);
    expect(impact).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Light);
  });

  it('hapticSelection fires a selection once', () => {
    hapticSelection();
    expect(selection).toHaveBeenCalledTimes(1);
  });

  it('hapticWarning fires a warning notification once', () => {
    hapticWarning();
    expect(notification).toHaveBeenCalledTimes(1);
    expect(notification).toHaveBeenCalledWith(Haptics.NotificationFeedbackType.Warning);
  });

  it('hapticSuccess fires a success notification once', () => {
    hapticSuccess();
    expect(notification).toHaveBeenCalledTimes(1);
    expect(notification).toHaveBeenCalledWith(Haptics.NotificationFeedbackType.Success);
  });

  it('never throws when expo-haptics rejects', async () => {
    impact.mockRejectedValueOnce(new Error('no engine'));
    selection.mockRejectedValueOnce(new Error('no engine'));
    notification.mockRejectedValueOnce(new Error('no engine'));
    notification.mockRejectedValueOnce(new Error('no engine'));
    expect(() => {
      hapticLight();
      hapticSelection();
      hapticWarning();
      hapticSuccess();
    }).not.toThrow();
    await Promise.resolve();
  });
});
