// Expo push transport (10-23, ALR-06, D-32). Verified 2026-11-22 against docs.expo.dev/push-notifications/sending-notifications:
// batches of at most 100 messages to /push/send; receipts via /push/getReceipts about 15 minutes later; when the account has
// "Enhanced security for push notifications" on, every request needs Authorization: Bearer <EXPO_ACCESS_TOKEN>.
export const SEND_URL = 'https://exp.host/--/api/v2/push/send';
export const RECEIPTS_URL = 'https://exp.host/--/api/v2/push/getReceipts';

export type ExpoMessage = {
  to: string;
  title: string;
  body: string;
  channelId: 'alerts' | 'digest';
  ttl: number;
  data: { kind: string; logId?: string };
};
export type ExpoTicket = { status: 'ok'; id: string } | { status: 'error'; message?: string; details?: { error?: string } };
export type ExpoReceipt = { status: 'ok' } | { status: 'error'; message?: string; details?: { error?: string } };

type Fetch = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}>;

export function createExpo(fetchFn: Fetch, accessToken: string | undefined) {
  const headers: Record<string, string> = { accept: 'application/json', 'content-type': 'application/json' };
  // Always sent when the secret is set; harmless when the account has enhanced security off.
  if (accessToken) headers.authorization = `Bearer ${accessToken}`;

  async function post(url: string, body: unknown): Promise<unknown> {
    const res = await fetchFn(url, { method: 'POST', headers, body: JSON.stringify(body) });
    if (!res.ok) throw new Error(`expo ${res.status}`);
    return res.json();
  }

  return {
    /** One batch (at most 100). Tickets come back in the order of the messages. */
    async send(messages: ExpoMessage[]): Promise<ExpoTicket[]> {
      const out = (await post(SEND_URL, messages)) as { data?: ExpoTicket[] };
      if (!Array.isArray(out?.data) || out.data.length !== messages.length) throw new Error('expo tickets');
      return out.data;
    },
    async getReceipts(ids: string[]): Promise<Record<string, ExpoReceipt>> {
      const out = (await post(RECEIPTS_URL, { ids })) as { data?: Record<string, ExpoReceipt> };
      return out?.data ?? {};
    },
  };
}
