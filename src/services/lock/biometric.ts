import * as LocalAuthentication from 'expo-local-authentication';
import { Platform } from 'react-native';

export type BiometricKind = 'faceId' | 'touchId' | 'fingerprint' | 'none';

let pending = false;

/** Pitfall 8: the system prompt backgrounds the app; the lock host checks this so it does not re-lock around the prompt. */
export function isBiometricPending(): boolean {
  return pending;
}

export async function biometricKind(): Promise<BiometricKind> {
  try {
    if (!(await LocalAuthentication.hasHardwareAsync())) return 'none';
    if (!(await LocalAuthentication.isEnrolledAsync())) return 'none';
    const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
    if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
      return Platform.OS === 'ios' ? 'faceId' : 'fingerprint';
    }
    if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
      return Platform.OS === 'ios' ? 'touchId' : 'fingerprint';
    }
    return 'none';
  } catch {
    return 'none';
  }
}

/** No OS passcode fallback (the app PIN is the fallback) and Android class 3 (strong) biometrics only. */
export async function authenticateBiometric(promptMessage: string, cancelLabel: string): Promise<'ok' | 'cancel' | 'fail'> {
  pending = true;
  try {
    const r = await LocalAuthentication.authenticateAsync({
      promptMessage,
      cancelLabel,
      disableDeviceFallback: true,
      biometricsSecurityLevel: 'strong',
    });
    if (r.success) return 'ok';
    return r.error === 'user_cancel' || r.error === 'system_cancel' || r.error === 'app_cancel' ? 'cancel' : 'fail';
  } catch {
    return 'fail';
  } finally {
    pending = false;
  }
}
