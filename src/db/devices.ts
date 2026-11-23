// 10-03 (ACC-06): the signed-in devices list. Read and written only through RPCs (list_my_devices, touch_my_device,
// revoke_my_session, created in 10-12); there is no direct table access, so no column constant.
import { toDbError } from './errors';
import type { DbClient } from './rows';

export interface DeviceInfo {
  sessionId: string;
  model: string;
  os: string;
  appVersion: string;
  lastActive: string;
  signedInAt: string;
  isCurrent: boolean;
}

interface DeviceDb {
  session_id: string;
  model: string;
  os: string;
  app_version: string;
  last_active: string;
  signed_in_at: string;
  is_current: boolean;
}

/** This device first, then the rest by last activity, newest first. */
export async function listMyDevices(client: DbClient): Promise<DeviceInfo[]> {
  const { data, error, status } = await client.rpc('list_my_devices');
  if (error) throw toDbError(error, status);
  const rows = ((data ?? []) as DeviceDb[]).map(
    (r): DeviceInfo => ({
      sessionId: r.session_id,
      model: r.model,
      os: r.os,
      appVersion: r.app_version,
      lastActive: r.last_active,
      signedInAt: r.signed_in_at,
      isCurrent: r.is_current,
    })
  );
  return rows.sort((a, b) => {
    if (a.isCurrent !== b.isCurrent) return a.isCurrent ? -1 : 1;
    return a.lastActive < b.lastActive ? 1 : a.lastActive > b.lastActive ? -1 : 0;
  });
}

export async function touchMyDevice(
  client: DbClient,
  info: { model: string; os: string; appVersion: string }
): Promise<void> {
  const { error, status } = await client.rpc('touch_my_device', {
    p_model: info.model,
    p_os: info.os,
    p_app_version: info.appVersion,
  });
  if (error) throw toDbError(error, status);
}

/** True when a session was found and signed out. */
export async function revokeMySession(client: DbClient, sessionId: string): Promise<boolean> {
  const { data, error, status } = await client.rpc('revoke_my_session', { p_session: sessionId });
  if (error) throw toDbError(error, status);
  return data === true;
}
