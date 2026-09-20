/** 出站同步队列：本地已落库后异步投递，失败自动重试 */

import { publishOutbound, type OutboundComment } from './dispatch';

export const OUTBOX_KEY = 'sarcasm_outbox_v1';
const ALARM_NAME = 'sarcasm_outbox_flush';
const MAX_ATTEMPTS = 8;

export interface OutboxItem extends OutboundComment {
  id: string;
  commentId: string;
  attempts: number;
  nextAt: number;
  lastError?: string;
}

async function loadQueue(): Promise<OutboxItem[]> {
  const stored = await browser.storage.local.get(OUTBOX_KEY);
  const raw = stored[OUTBOX_KEY];
  if (!Array.isArray(raw)) return [];
  return raw.filter((item): item is OutboxItem => {
    return (
      !!item &&
      typeof item === 'object' &&
      typeof (item as OutboxItem).id === 'string' &&
      typeof (item as OutboxItem).commentId === 'string' &&
      typeof (item as OutboxItem).platform === 'string' &&
      typeof (item as OutboxItem).videoId === 'string' &&
      typeof (item as OutboxItem).body === 'string'
    );
  });
}

async function saveQueue(items: OutboxItem[]): Promise<void> {
  await browser.storage.local.set({ [OUTBOX_KEY]: items });
}

function backoffMs(attempts: number): number {
  // 5s → 15s → 45s → … 上限 30min
  return Math.min(5_000 * 3 ** Math.max(0, attempts - 1), 30 * 60_000);
}

export async function enqueueOutbound(
  event: OutboundComment & { commentId: string },
): Promise<OutboxItem> {
  const queue = await loadQueue();
  // 同评论去重，避免重复投递
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

/** 处理到期任务；返回剩余队列长度 */
export async function flushOutbox(): Promise<number> {
  if (flushing) return outboxPendingCount();
  flushing = true;
  try {
    const now = Date.now();
    let queue = await loadQueue();
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
      });

      const failed = results.filter((r) => !r.ok);
      // 没有启用任何后端，或全部成功 → 出队
      if (!results.length || failed.length === 0) {
        continue;
      }

      const attempts = item.attempts + 1;
      const err = failed.map((f) => `${f.id}:${f.error || 'fail'}`).join('; ');
      if (attempts >= MAX_ATTEMPTS) {
        console.warn('[sarcasm] outbox dropped', item.commentId, err);
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
