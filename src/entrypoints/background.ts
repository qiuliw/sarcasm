import {
  countAll,
  createComment,
  deleteComment,
  ensureDb,
  listComments,
} from '../lib/db/sqlite';
import type { BgRequest, BgResponse } from '../lib/messaging/api';

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
    case 'create_comment':
      return { ok: true, data: await createComment(message.input) };
    case 'delete_comment':
      await deleteComment(message.id);
      return { ok: true };
    case 'stats':
      return { ok: true, data: { count: await countAll() } };
    default:
      return { ok: false, error: 'unknown message' };
  }
}
