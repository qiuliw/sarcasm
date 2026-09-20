import type {
  CommentRecord,
  CreateCommentInput,
  ListCommentsQuery,
  VoteCommentInput,
  VoteKind,
} from '../db/types';
import type { NostrIdentity, NostrSettings } from '../nostr/settings';
import type { RelayProbeResult } from '../nostr/probe';
import type { OutboxTrashItem } from '../backends/outbox';
import type { AnchorPack } from '../anchors/packs';

export type BgRequest =
  | { type: 'ping' }
  | { type: 'open_options' }
  | { type: 'list_comments'; query: ListCommentsQuery }
  | { type: 'sync_comments'; query: ListCommentsQuery }
  | { type: 'create_comment'; input: CreateCommentInput }
  | { type: 'delete_comment'; id: string }
  | { type: 'vote_comment'; input: VoteCommentInput }
  | { type: 'stats' }
  | { type: 'outbox_pending' }
  | { type: 'outbox_trash_list' }
  | { type: 'outbox_trash_clear' }
  | { type: 'outbox_trash_retry'; ids?: string[] }
  | { type: 'nostr_identity' }
  | { type: 'nostr_get_settings' }
  | { type: 'nostr_save_settings'; settings: NostrSettings }
  | { type: 'nostr_save_display_name'; displayName: string }
  | { type: 'nostr_probe_relays'; urls: string[] }
  | { type: 'nostr_generate_key' }
  | { type: 'nostr_import_key'; nsec: string }
  | { type: 'nostr_export_key' }
  | { type: 'nostr_clear_key' }
  | { type: 'anchors_list' }
  | { type: 'anchors_export' }
  | { type: 'anchors_import'; json: string }
  | { type: 'anchors_clear_custom' }
  | { type: 'clear_comments_cache' }
  | { type: 'reset_all_config' };

export type BgResponse =
  | { ok: true; data?: unknown }
  | { ok: false; error: string };

export async function sendBg<T = unknown>(request: BgRequest): Promise<T> {
  const res = (await browser.runtime.sendMessage(request)) as BgResponse;
  if (!res?.ok) {
    throw new Error(res?.error || '后台请求失败');
  }
  return res.data as T;
}

export function listComments(query: ListCommentsQuery): Promise<CommentRecord[]> {
  return sendBg({ type: 'list_comments', query });
}

export function syncComments(
  query: ListCommentsQuery,
): Promise<{ fetched: number; imported: number; error?: string; comments: CommentRecord[] }> {
  return sendBg({ type: 'sync_comments', query });
}

export function createComment(input: CreateCommentInput): Promise<CommentRecord> {
  return sendBg({ type: 'create_comment', input });
}

export function deleteComment(id: string): Promise<void> {
  return sendBg({ type: 'delete_comment', id });
}

export function voteComment(id: string, vote: VoteKind): Promise<CommentRecord> {
  return sendBg({ type: 'vote_comment', input: { id, vote } });
}

export function getStats(): Promise<{ count: number; bytes: number }> {
  return sendBg({ type: 'stats' });
}

export function getOutboxPending(): Promise<{ count: number; trash: number }> {
  return sendBg({ type: 'outbox_pending' });
}

export function listOutboxTrash(): Promise<OutboxTrashItem[]> {
  return sendBg({ type: 'outbox_trash_list' });
}

export function clearOutboxTrashApi(): Promise<void> {
  return sendBg({ type: 'outbox_trash_clear' });
}

export function retryOutboxTrashApi(ids?: string[]): Promise<number> {
  return sendBg({ type: 'outbox_trash_retry', ids });
}

/** content script 没有 openOptionsPage，统一走 background */
export function openOptions(): Promise<void> {
  return sendBg({ type: 'open_options' });
}

export function getNostrIdentity(): Promise<NostrIdentity> {
  return sendBg({ type: 'nostr_identity' });
}

export function getNostrSettings(): Promise<NostrSettings> {
  return sendBg({ type: 'nostr_get_settings' });
}

export function saveNostrSettingsApi(settings: NostrSettings): Promise<NostrSettings> {
  return sendBg({ type: 'nostr_save_settings', settings });
}

export function saveDisplayNameApi(displayName: string): Promise<NostrSettings> {
  return sendBg({ type: 'nostr_save_display_name', displayName });
}

export function probeNostrRelaysApi(urls: string[]): Promise<RelayProbeResult[]> {
  return sendBg({ type: 'nostr_probe_relays', urls });
}

export function generateNostrKeyApi(): Promise<NostrSettings> {
  return sendBg({ type: 'nostr_generate_key' });
}

export function importNostrKeyApi(nsec: string): Promise<NostrSettings> {
  return sendBg({ type: 'nostr_import_key', nsec });
}

export function exportNostrKeyApi(): Promise<string> {
  return sendBg({ type: 'nostr_export_key' });
}

export function clearNostrKeyApi(): Promise<NostrSettings> {
  return sendBg({ type: 'nostr_clear_key' });
}

export function listAnchorPacks(): Promise<{
  all: AnchorPack[];
  custom: AnchorPack[];
}> {
  return sendBg({ type: 'anchors_list' });
}

export function exportAnchorPacks(): Promise<string> {
  return sendBg({ type: 'anchors_export' });
}

export function importAnchorPacks(json: string): Promise<AnchorPack[]> {
  return sendBg({ type: 'anchors_import', json });
}

export function clearCustomAnchorPacks(): Promise<AnchorPack[]> {
  return sendBg({ type: 'anchors_clear_custom' });
}

export function resetAllConfigApi(): Promise<void> {
  return sendBg({ type: 'reset_all_config' });
}

export function clearCommentsCacheApi(): Promise<number> {
  return sendBg({ type: 'clear_comments_cache' });
}
