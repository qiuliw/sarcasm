import {
  countAll,
  createComment,
  deleteComment,
  ensureDb,
  listComments,
  voteComment,
} from '../lib/db/sqlite';
import type { BgRequest, BgResponse } from '../lib/messaging/api';
import { publishOutbound } from '../lib/backends/dispatch';
import {
  loadEnabledBackends,
  saveEnabledBackends,
} from '../lib/backends/dispatch';
import {
  clearOutboxTrash,
  enqueueOutbound,
  ensureOutboxAlarm,
  flushOutbox,
  isOutboxAlarm,
  outboxPendingCount,
  outboxTrashCount,
  outboxTrashList,
  retryOutboxTrash,
} from '../lib/backends/outbox';
import {
  exportPacksJson,
  importPacksJson,
  loadAllPacks,
  loadCustomPacks,
  saveCustomPacks,
} from '../lib/anchors/store';
import {
  clearNostrKey,
  exportNostrKey,
  generateNostrKey,
  importNostrKey,
  loadNostrIdentity,
  loadNostrSettings,
  saveDisplayName,
  saveNostrSettings,
} from '../lib/nostr/settings';
import { resetAllConfig } from '../lib/prefs/reset';

export default defineBackground(() => {
  void ensureDb().catch((err) => {
    console.error('[sarcasm] sqlite init failed', err);
  });

  void ensureOutboxAlarm().then(() => flushOutbox()).catch((err) => {
    console.warn('[sarcasm] outbox boot flush failed', err);
  });

  browser.alarms.onAlarm.addListener((alarm) => {
    if (!isOutboxAlarm(alarm.name)) return;
    void flushOutbox().catch((err) => {
      console.warn('[sarcasm] outbox alarm flush failed', err);
    });
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
    case 'open_options':
      await browser.runtime.openOptionsPage();
      return { ok: true };
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

      const payload = {
        commentId: record.id,
        platform: record.platform,
        videoId: record.videoId,
        body: record.body,
        parentId: record.parentId,
        pageUrl: message.input.pageUrl,
      };

      const settings = await loadNostrSettings();
      if (settings.asyncPublish) {
        await enqueueOutbound(payload);
        void flushOutbox().catch((err) => {
          console.warn('[sarcasm] outbox flush failed', err);
        });
      } else {
        const results = await publishOutbound(payload);
        for (const r of results) {
          if (!r.ok) console.warn(`[sarcasm] backend ${r.id} failed`, r.error);
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
    case 'outbox_pending':
      return {
        ok: true,
        data: {
          count: await outboxPendingCount(),
          trash: await outboxTrashCount(),
        },
      };
    case 'outbox_trash_list':
      return { ok: true, data: await outboxTrashList() };
    case 'outbox_trash_clear':
      await clearOutboxTrash();
      return { ok: true };
    case 'outbox_trash_retry':
      return { ok: true, data: await retryOutboxTrash(message.ids) };
    case 'nostr_identity':
      return { ok: true, data: await loadNostrIdentity() };
    case 'nostr_get_settings':
      return { ok: true, data: await loadNostrSettings() };
    case 'nostr_save_settings':
      return { ok: true, data: await saveNostrSettings(message.settings) };
    case 'nostr_save_display_name':
      return { ok: true, data: await saveDisplayName(message.displayName) };
    case 'nostr_generate_key':
      return { ok: true, data: await generateNostrKey() };
    case 'nostr_import_key':
      return { ok: true, data: await importNostrKey(message.nsec) };
    case 'nostr_export_key':
      return { ok: true, data: await exportNostrKey() };
    case 'nostr_clear_key':
      return { ok: true, data: await clearNostrKey() };
    case 'backends_get':
      return { ok: true, data: await loadEnabledBackends() };
    case 'backends_set':
      return { ok: true, data: await saveEnabledBackends(message.ids) };
    case 'anchors_list':
      return {
        ok: true,
        data: {
          all: await loadAllPacks(),
          custom: await loadCustomPacks(),
        },
      };
    case 'anchors_export':
      return { ok: true, data: await exportPacksJson(message.includeBuiltin !== false) };
    case 'anchors_import':
      return { ok: true, data: await importPacksJson(message.json) };
    case 'anchors_clear_custom':
      await saveCustomPacks([]);
      return { ok: true, data: [] };
    case 'reset_all_config':
      await resetAllConfig();
      return { ok: true };
    default:
      return { ok: false, error: 'unknown message' };
  }
}
