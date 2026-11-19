// 09-25 (A5-2): "Manage subscription" is never a dead tap. With no store subscription (NONE, BACKFILL, PROMOTIONAL) or
// with the store SDK not set up, it opens the platform's subscriptions page; the SDK path falls back to the same page.
import { Linking, Platform } from 'react-native';

const mockShowManage = jest.fn();
const mockCustomerInfo = jest.fn();
jest.mock(
  'react-native-purchases',
  () => ({
    __esModule: true,
    default: {
      configure: jest.fn(),
      logIn: jest.fn(async () => undefined),
      showManageSubscriptions: () => mockShowManage(),
      getCustomerInfo: () => mockCustomerInfo(),
      PURCHASES_ERROR_CODE: {},
    },
  }),
  { virtual: true },
);

type Client = typeof import('../purchasesClient');

function load(os: 'ios' | 'android'): Client {
  let client!: Client;
  Object.defineProperty(Platform, 'OS', { configurable: true, get: () => os });
  jest.isolateModules(() => {
    // the isolated registry has its own react-native: set its Platform and spy on its Linking too
    const rn = require('react-native') as typeof import('react-native');
    Object.defineProperty(rn.Platform, 'OS', { configurable: true, get: () => os });
    if (rn.Linking !== Linking) jest.spyOn(rn.Linking, 'openURL').mockImplementation((u: string) => Linking.openURL(u));
    client = require('../purchasesClient') as Client;
  });
  return client;
}

const PLAY = 'https://play.google.com/store/account/subscriptions';
const APPLE = 'itms-apps://apps.apple.com/account/subscriptions';
const realOS = Platform.OS;

let openURL: jest.SpyInstance;
beforeEach(() => {
  mockShowManage.mockReset();
  mockCustomerInfo.mockReset();
  openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
});
afterEach(() => {
  openURL.mockRestore();
  Object.defineProperty(Platform, 'OS', { configurable: true, get: () => realOS });
});

describe('openManageSubscription', () => {
  it.each(['NONE', 'BACKFILL', 'PROMOTIONAL', null])('Android, store %s: opens the Play subscriptions page', async (store) => {
    const c = load('android');
    await c.startPurchases('key', 'u1');
    await expect(c.openManageSubscription({ store })).resolves.toBe(true);
    expect(openURL).toHaveBeenCalledWith(PLAY);
    expect(mockCustomerInfo).not.toHaveBeenCalled();
  });

  it('iOS, store NONE: opens the App Store subscriptions page, not the SDK sheet', async () => {
    const c = load('ios');
    await c.startPurchases('key', 'u1');
    await expect(c.openManageSubscription({ store: 'NONE' })).resolves.toBe(true);
    expect(openURL).toHaveBeenCalledWith(APPLE);
    expect(mockShowManage).not.toHaveBeenCalled();
  });

  it('SDK never set up (no key): still opens the store page instead of doing nothing', async () => {
    const c = load('android');
    await expect(c.openManageSubscription({ store: 'PLAY_STORE' })).resolves.toBe(true);
    expect(openURL).toHaveBeenCalledWith(PLAY);
  });

  it('a Play subscription opens its management URL from the store', async () => {
    const c = load('android');
    await c.startPurchases('key', 'u1');
    mockCustomerInfo.mockResolvedValue({ managementURL: 'https://play.google.com/store/account/subscriptions?sku=x' });
    await expect(c.openManageSubscription({ store: 'PLAY_STORE' })).resolves.toBe(true);
    expect(openURL).toHaveBeenCalledWith('https://play.google.com/store/account/subscriptions?sku=x');
  });

  it('an App Store subscription uses the SDK sheet, and falls back to the page when it fails', async () => {
    const c = load('ios');
    await c.startPurchases('key', 'u1');
    mockShowManage.mockResolvedValueOnce(undefined);
    await expect(c.openManageSubscription({ store: 'APP_STORE' })).resolves.toBe(true);
    expect(openURL).not.toHaveBeenCalled();
    mockShowManage.mockRejectedValueOnce(new Error('no sheet'));
    await expect(c.openManageSubscription({ store: 'APP_STORE' })).resolves.toBe(true);
    expect(openURL).toHaveBeenCalledWith(APPLE);
  });

  it('resolves false only when no page opened', async () => {
    const c = load('android');
    openURL.mockRejectedValue(new Error('no handler'));
    await expect(c.openManageSubscription({ store: 'NONE' })).resolves.toBe(false);
  });
});
