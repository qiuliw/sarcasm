/** 出站同步队列：本地已落库后异步投递，失败自动重试；永久失败进垃圾桶 */

import { publishOutbound, type OutboundComment } from './dispatch';

export const OUTBOX_KEY = 'sarcasm_outbox_v1';
export const OUTBOX_TRASH_KEY = 'sarcasm_outbox_trash_v1';
const ALARM_NAME = 'sarcasm_outbox_flush';
const MAX_ATTEMPTS = 8;
const MAX_TRASH = 100;

export interface OutboxItem extends OutboundComment {
  id: string;
  commentId: string;
  attempts: number;
  nextAt: number;
  lastError?: string;
}

export interface OutboxTrashItem extends OutboxItem {
  failedAt: number;
}

function isOutboxItem(item: unknown): item is OutboxItem {
  return (
    !!item &&
    typeof item === 'object' &&
    typeof (item as OutboxItem).id === 'string' &&
    typeof (item as OutboxItem).commentId === 'string' &&
    typeof (item as OutboxItem).platform === 'string' &&
    typeof (item as OutboxItem).videoId === 'string' &&
    typeof (item as OutboxItem).body === 'string'
  );
}

async function loadQueue(): Promise<OutboxItem[]> {
  const stored = await browser.storage.local.get(OUTBOX_KEY);
  const raw = stored[OUTBOX_KEY];
  if (!Array.isArray(raw)) return [];
  return raw.filter(isOutboxItem);
}

async function saveQueue(items: OutboxItem[]): Promise<void> {
  await browser.storage.local.set({ [OUTBOX_KEY]: items });
}

async function loadTrash(): Promise<OutboxTrashItem[]> {
  const stored = await browser.storage.local.get(OUTBOX_TRASH_KEY);
  const raw = stored[OUTBOX_TRASH_KEY];
  if (!Array.isArray(raw)) return [];
  return raw.filter((item): item is OutboxTrashItem => {
    return isOutboxItem(item) && typeof (item as OutboxTrashItem).failedAt === 'number';
  });
}

async function saveTrash(items: OutboxTrashItem[]): Promise<void> {
  await browser.storage.local.set({ [OUTBOX_TRASH_KEY]: items.slice(0, MAX_TRASH) });
}

async function pushTrash(item: OutboxItem, error: string): Promise<void> {
  const trash = await loadTrash();
  const next: OutboxTrashItem = {
    ...item,
    lastError: error,
    failedAt: Date.now(),
  };
  // 同评论只保留最新失败
  const filtered = trash.filter((t) => t.commentId !== item.commentId);
  filtered.unshift(next);
  await saveTrash(filtered);
}

function backoffMs(attempts: number): number {
  return Math.min(5_000 * 3 ** Math.max(0, attempts - 1), 30 * 60_000);
}

export async function enqueueOutbound(
  event: OutboundComment & { commentId: string },
): Promise<OutboxItem> {
  const queue = await loadQueue();
  const filtered = queue.filter((q) => q.commentId !== event.commentId);
  const item: OutboxItem = {
    id: crypto.randomUUID(),
    commentId: event.commentId,
    platform: event.platform,
    videoId: event.videoId,
    body: event.body,
    parentId: event.parentId ?? null,
    pageUrl: event.pageUrl,
    attempts: 0,
    nextAt: Date.now(),
  };
  filtered.push(item);
  await saveQueue(filtered);
  await ensureOutboxAlarm();
  return item;
}

export async function outboxPendingCount(): Promise<number> {
  return (await loadQueue()).length;
}

export async function outboxTrashList(): Promise<OutboxTrashItem[]> {
  return loadTrash();
}

export async function outboxTrashCount(): Promise<number> {
  return (await loadTrash()).length;
}

export async function clearOutboxTrash(): Promise<void> {
  await saveTrash([]);
}

/** 从垃圾桶重新入队 */
export async function retryOutboxTrash(ids?: string[]): Promise<number> {
  const trash = await loadTrash();
  const pick = ids?.length ? trash.filter((t) => ids.includes(t.id)) : trash;
  if (!pick.length) return 0;

  for (const item of pick) {
    await enqueueOutbound({
      commentId: item.commentId,
      platform: item.platform,
      videoId: item.videoId,
      body: item.body,
      parentId: item.parentId,
      pageUrl: item.pageUrl,
    });
  }

  const remain = ids?.length
    ? trash.filter((t) => !ids.includes(t.id))
    : [];
  await saveTrash(remain);
  return pick.length;
}

export async function ensureOutboxAlarm(): Promise<void> {
  const existing = await browser.alarms.get(ALARM_NAME);
  if (existing) return;
  await browser.alarms.create(ALARM_NAME, {
    periodInMinutes: 1,
  });
}

export function isOutboxAlarm(name: string): boolean {
  return name === ALARM_NAME;
}

let flushing = false;

export async function flushOutbox(): Promise<number> {
  if (flushing) return outboxPendingCount();
  flushing = true;
  try {
    const now = Date.now();
    const queue = await loadQueue();
    const due = queue.filter((item) => item.nextAt <= now);
    if (!due.length) return queue.length;

    const remain: OutboxItem[] = queue.filter((item) => item.nextAt > now);

    for (const item of due) {
      const results = await publishOutbound({
        platform: item.platform,
        videoId: item.videoId,
        body: item.body,
        parentId: item.parentId,
        pageUrl: item.pageUrl,
        commentId: item.commentId,
      });

      const failed = results.filter((r) => !r.ok);
      if (!results.length || failed.length === 0) {
        const eventId = results.find((r) => r.eventId)?.eventId;
        if (eventId && item.commentId) {
          try {
            const { remapCommentId } = await import('../db/sqlite');
            await remapCommentId(item.commentId, eventId);
          } catch (err) {
            console.warn('[sarcasm] remap comment id failed', err);
          }
        }
        continue;
      }

      const attempts = item.attempts + 1;
      const err = failed.map((f) => `${f.id}:${f.error || 'fail'}`).join('; ');
      if (attempts >= MAX_ATTEMPTS) {
        console.warn('[sarcasm] outbox moved to trash', item.commentId, err);
        await pushTrash({ ...item, attempts }, err);
        continue;
      }

      remain.push({
        ...item,
        attempts,
        nextAt: now + backoffMs(attempts),
        lastError: err,
      });
    }

    await saveQueue(remain);
    if (remain.length) await ensureOutboxAlarm();
    return remain.length;
  } finally {
    flushing = false;
  }
}
