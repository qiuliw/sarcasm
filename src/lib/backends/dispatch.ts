/** 出站事件源：本地永远写库；这里只管额外同步 */

export type BackendId = 'nostr';

export interface OutboundComment {
  platform: string;
  videoId: string;
  body: string;
  parentId?: string | null;
  replyToPubkey?: string | null;
  replyToAuthor?: string | null;
  pageUrl?: string;
  commentId?: string;
}

export interface BackendResult {
  id: BackendId;
  ok: boolean;
  error?: string;
  eventId?: string;
}

export async function publishOutbound(event: OutboundComment): Promise<BackendResult[]> {
  const { publishCommentToNostr } = await import('../nostr/publish');
  const published = await publishCommentToNostr({
    platform: event.platform,
    videoId: event.videoId,
    body: event.body,
    parentCommentId: event.parentId,
    replyToPubkey: event.replyToPubkey,
    replyToAuthor: event.replyToAuthor,
    pageUrl: event.pageUrl,
    localCommentId: event.commentId,
  });
  return [{
    id: 'nostr',
    ok: published.ok,
    error: published.error,
    eventId: published.eventId,
  }];
}
