/** 出站事件源：本地永远写库；这里只管额外同步 */

export type BackendId = 'nostr' | 'p2p';

export interface OutboundComment {
  platform: string;
  videoId: string;
  body: string;
  parentId?: string | null;
  pageUrl?: string;
}

export interface BackendResult {
  id: BackendId;
  ok: boolean;
  error?: string;
}

const BACKENDS_KEY = 'sarcasm_event_backends_v1';

export const BACKEND_META: Array<{ id: BackendId; name: string; ready: boolean }> = [
  { id: 'nostr', name: 'Nostr 联邦 relay', ready: true },
  { id: 'p2p', name: 'P2P 全分布式（预留）', ready: false },
];

export async function loadEnabledBackends(): Promise<BackendId[]> {
  const stored = await browser.storage.local.get(BACKENDS_KEY);
  const raw = stored[BACKENDS_KEY];
  if (!Array.isArray(raw)) return ['nostr'];
  const allowed = new Set(BACKEND_META.map((b) => b.id));
  const list = raw.filter((id): id is BackendId => allowed.has(id as BackendId));
  return list.length ? list : [];
}

export async function saveEnabledBackends(ids: BackendId[]): Promise<BackendId[]> {
  const ready = new Set(BACKEND_META.filter((b) => b.ready).map((b) => b.id));
  const next = [...new Set(ids.filter((id) => ready.has(id)))];
  await browser.storage.local.set({ [BACKENDS_KEY]: next });
  return next;
}

export async function publishOutbound(event: OutboundComment): Promise<BackendResult[]> {
  const enabled = await loadEnabledBackends();
  const results: BackendResult[] = [];

  for (const id of enabled) {
    if (id === 'nostr') {
      const { publishCommentToNostr } = await import('../nostr/publish');
      const published = await publishCommentToNostr({
        platform: event.platform,
        videoId: event.videoId,
        body: event.body,
        parentCommentId: event.parentId,
        pageUrl: event.pageUrl,
      });
      results.push({
        id,
        ok: published.ok,
        error: published.error,
      });
      continue;
    }
    if (id === 'p2p') {
      results.push({ id, ok: false, error: 'P2P 源尚未接入' });
    }
  }

  return results;
}
