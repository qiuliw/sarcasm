/** 出站事件源：本地永远写库；这里只管额外同步 */

export type BackendId = 'nostr';

export interface OutboundComment {
  platform: string;
  videoId: string;
  body: string;
  parentId?: string | null;
  pageUrl?: string;
  commentId?: string;
}

export interface BackendResult {
  id: BackendId;
  ok: boolean;
  error?: string;
  eventId?: string;
}

const BACKENDS_KEY = 'sarcasm_event_backends_v1';

export const BACKEND_META: Array<{ id: BackendId; name: string; ready: boolean }> = [
  { id: 'nostr', name: 'Nostr', ready: true },
];

export function availableBackends() {
  return BACKEND_META.filter((b) => b.ready);
}

export async function loadEnabledBackends(): Promise<BackendId[]> {
  return ['nostr'];
}

export async function saveEnabledBackends(_ids: BackendId[]): Promise<BackendId[]> {
  const next: BackendId[] = ['nostr'];
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
        localCommentId: event.commentId,
      });
      results.push({
        id,
        ok: published.ok,
        error: published.error,
        eventId: published.eventId,
      });
    }
  }

  return results;
}
