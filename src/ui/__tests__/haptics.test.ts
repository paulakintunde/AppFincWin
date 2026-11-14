import * as Haptics from 'expo-haptics';

import {
  hapticFailed,
  hapticLight,
  hapticMedium,
  hapticMilestone,
  hapticSelection,
  hapticSuccess,
  hapticTap,
  hapticTick,
  hapticWarn,
  hapticWarning,
} from '../haptics';
import { setHapticsEnabled } from '../hapticsSetting';

const impact = Haptics.impactAsync as jest.Mock;
const selection = Haptics.selectionAsync as jest.Mock;
const notification = Haptics.notificationAsync as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  setHapticsEnabled(true);
});

afterAll(() => {
  setHapticsEnabled(true);
});

describe('haptics by meaning (D-20)', () => {
  it('hapticTap fires a light impact once', () => {
    hapticTap();
    expect(impact).toHaveBeenCalledTimes(1);
    expect(impact).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Light);
  });

  it('hapticWarn fires a warning notification once', () => {
    hapticWarn();
    expect(notification).toHaveBeenCalledTimes(1);
    expect(notification).toHaveBeenCalledWith(Haptics.NotificationFeedbackType.Warning);
  });

  it('hapticMilestone fires a success notification once', () => {
    hapticMilestone();
    expect(notification).toHaveBeenCalledTimes(1);
    expect(notification).toHaveBeenCalledWith(Haptics.NotificationFeedbackType.Success);
  });

  it('hapticFailed fires an error notification once', () => {
    hapticFailed();
    expect(notification).toHaveBeenCalledTimes(1);
    expect(notification).toHaveBeenCalledWith(Haptics.NotificationFeedbackType.Error);
  });

  it('hapticTick fires a selection once', () => {
    hapticTick();
    expect(selection).toHaveBeenCalledTimes(1);
    expect(impact).not.toHaveBeenCalled();
  });
});

describe('deprecated aliases route to the meaning functions', () => {
  it('hapticLight is a light tap', () => {
    hapticLight();
    expect(impact).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Light);
  });

  it('hapticMedium is a tick (no medium meaning in D-20)', () => {
    hapticMedium();
    expect(selection).toHaveBeenCalledTimes(1);
    expect(impact).not.toHaveBeenCalled();
  });

  it('hapticSelection is a tick', () => {
    hapticSelection();
    expect(selection).toHaveBeenCalledTimes(1);
  });

  it('hapticWarning is a warning', () => {
    hapticWarning();
    expect(notification).toHaveBeenCalledWith(Haptics.NotificationFeedbackType.Warning);
  });

  it('hapticSuccess is a milestone', () => {
    hapticSuccess();
    expect(notification).toHaveBeenCalledWith(Haptics.NotificationFeedbackType.Success);
  });
});

describe('the Haptics switch gates every haptic (D-21)', () => {
  const all: [string, () => void][] = [
    ['hapticTap', hapticTap],
    ['hapticWarn', hapticWarn],
    ['hapticMilestone', hapticMilestone],
    ['hapticFailed', hapticFailed],
    ['hapticTick', hapticTick],
    ['hapticLight', hapticLight],
    ['hapticMedium', hapticMedium],
    ['hapticSelection', hapticSelection],
    ['hapticWarning', hapticWarning],
    ['hapticSuccess', hapticSuccess],
  ];

  it.each(all)('%s does nothing with the switch off', (_name, fn) => {
    setHapticsEnabled(false);
    fn();
    expect(impact).not.toHaveBeenCalled();
    expect(selection).not.toHaveBeenCalled();
    expect(notification).not.toHaveBeenCalled();
    setHapticsEnabled(true);
  });

  it('fires again once the switch is back on', () => {
    setHapticsEnabled(false);
    hapticTap();
    setHapticsEnabled(true);
    hapticTap();
    expect(impact).toHaveBeenCalledTimes(1);
  });
});

describe('a missing haptic engine never breaks the action (T-06.2-03-02)', () => {
  it('never throws when expo-haptics rejects', async () => {
    impact.mockRejectedValueOnce(new Error('no engine'));
    selection.mockRejectedValueOnce(new Error('no engine'));
    notification.mockRejectedValueOnce(new Error('no engine'));
    notification.mockRejectedValueOnce(new Error('no engine'));
    notification.mockRejectedValueOnce(new Error('no engine'));
    expect(() => {
      hapticTap();
      hapticTick();
      hapticWarn();
      hapticMilestone();
      hapticFailed();
    }).not.toThrow();
    await Promise.resolve();
  });
});
