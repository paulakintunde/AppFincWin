// 10-12 (ACC-06): what this phone calls itself in the signed-in devices list. Model, OS and app version only.
import * as Device from 'expo-device';
import * as Application from 'expo-application';

export interface ThisDeviceInfo {
  model: string;
  os: string;
  appVersion: string;
}

export function deviceInfo(): ThisDeviceInfo {
  const os = [Device.osName, Device.osVersion].filter((p): p is string => Boolean(p)).join(' ');
  return {
    model: Device.modelName ?? '',
    os,
    appVersion: Application.nativeApplicationVersion ?? '',
  };
}
