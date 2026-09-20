import type { Platform } from '../db/types';
import { nsecToSecret } from './keys';
import { loadNostrSettings } from './settings';
import { finalizeEvent, type EventTemplate } from 'nostr-tools/pure';
import { SimplePool } from 'nostr-tools/pool';

export interface PublishCommentInput {
  platform: Platform;
  videoId: string;
  body: string;
  parentCommentId?: string | null;
  pageUrl?: string;
}

export interface PublishResult {
  ok: boolean;
  eventId?: string;
  error?: string;
  accepted: number;
}

function buildContent(input: PublishCommentInput): string {
  const tag = `${input.platform}:${input.videoId}`;
  return `${input.body}\n\n#sarcasm ${tag}`;
}

export async function publishCommentToNostr(
  input: PublishCommentInput,
): Promise<PublishResult> {
  const settings = await loadNostrSettings();
  if (!settings.nsec) {
    return { ok: false, error: '未配置 Nostr 密钥', accepted: 0 };
  }
  if (!settings.publishEnabled) {
    return { ok: true, accepted: 0 };
  }
  if (!settings.relays.length) {
    return { ok: false, error: '未配置 relay', accepted: 0 };
  }

  try {
    const sk = nsecToSecret(settings.nsec);
    const template: EventTemplate = {
      kind: 1,
      created_at: Math.floor(Date.now() / 1000),
      content: buildContent(input),
      tags: [
        ['client', 'sarcasm'],
        ['i', `${input.platform}:${input.videoId}`],
        ['r', input.pageUrl || `${input.platform}:${input.videoId}`],
      ],
    };
    if (input.parentCommentId) {
      template.tags.push(['e', input.parentCommentId, '', 'reply']);
    }
    if (settings.displayName) {
      template.tags.push(['n', settings.displayName]);
    }

    const event = finalizeEvent(template, sk);
    const pool = new SimplePool();
    try {
      const results = await Promise.allSettled(
        pool.publish(settings.relays, event),
      );
      const accepted = results.filter((r) => r.status === 'fulfilled').length;
      // 配 1 个 relay → 要 1 个；配多个 → 至少 2 个接受算成功（gossip 更稳）
      const need = Math.min(2, settings.relays.length);
      if (accepted < need) {
        return {
          ok: false,
          error: `仅 ${accepted}/${settings.relays.length} 个 relay 接受（需 ≥${need}）`,
          eventId: event.id,
          accepted,
        };
      }
      return { ok: true, eventId: event.id, accepted };
    } finally {
      pool.close(settings.relays);
    }
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
      accepted: 0,
    };
  }
}
