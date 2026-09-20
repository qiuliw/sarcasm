import {
  countAll,
  createComment,
  deleteComment,
  ensureDb,
  listComments,
  voteComment,
} from '../lib/db/sqlite';
import type { BgRequest, BgResponse } from '../lib/messaging/api';
import { publishCommentToNostr } from '../lib/nostr/publish';
import {
  clearNostrKey,
  generateNostrKey,
  importNostrKey,
  loadNostrIdentity,
  loadNostrSettings,
  saveNostrSettings,
} from '../lib/nostr/settings';

export default defineBackground(() => {
  void ensureDb().catch((err) => {
    console.error('[sarcasm] sqlite init failed', err);
  });

  browser.runtime.onMessage.addListener((message: BgRequest): Promise<BgResponse> => {
    return handle(message).catch((err) => ({
      ok: false as const,
      error: err instanceof Error ? err.message : String(err),
    }));
  });
});

async function handle(message: BgRequest): Promise<BgResponse> {
  switch (message.type) {
    case 'ping':
      await ensureDb();
      return { ok: true, data: { pong: true } };
    case 'list_comments':
      return { ok: true, data: await listComments(message.query) };
    case 'create_comment': {
      const identity = await loadNostrIdentity();
      if (!identity.configured) {
        return { ok: false, error: '请先在设置页配置 Nostr 密钥' };
      }
      const record = await createComment({
        ...message.input,
        author: message.input.author || identity.shortLabel,
      });
      if (identity.publishEnabled) {
        const published = await publishCommentToNostr({
          platform: record.platform,
          videoId: record.videoId,
          body: record.body,
          parentCommentId: record.parentId,
          pageUrl: message.input.pageUrl,
        });
        if (!published.ok) {
          console.warn('[sarcasm] nostr publish failed', published.error);
        }
      }
      return { ok: true, data: record };
    }
    case 'delete_comment':
      await deleteComment(message.id);
      return { ok: true };
    case 'vote_comment':
      return { ok: true, data: await voteComment(message.input) };
    case 'stats':
      return { ok: true, data: { count: await countAll() } };
    case 'nostr_identity':
      return { ok: true, data: await loadNostrIdentity() };
    case 'nostr_get_settings':
      return { ok: true, data: await loadNostrSettings() };
    case 'nostr_save_settings':
      return { ok: true, data: await saveNostrSettings(message.settings) };
    case 'nostr_generate_key':
      return { ok: true, data: await generateNostrKey() };
    case 'nostr_import_key':
      return { ok: true, data: await importNostrKey(message.nsec) };
    case 'nostr_clear_key':
      return { ok: true, data: await clearNostrKey() };
    default:
      return { ok: false, error: 'unknown message' };
  }
}
