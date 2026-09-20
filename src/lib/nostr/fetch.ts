import type { Event } from 'nostr-tools/pure';
import { SimplePool } from 'nostr-tools/pool';
import { shortNpub } from './keys';
import { loadNostrSettings } from './settings';
import { absorbRemoteComment } from '../db/sqlite';
import type { AnchorRuleId, CommentRecord } from '../db/types';

export interface PullCommentsInput {
  platform: AnchorRuleId;
  videoId: string;
}

export interface PullCommentsResult {
  fetched: number;
  imported: number;
  error?: string;
}

/** 去掉发布时附加的 #sarcasm 脚注 */
export function parseSarcasmBody(content: string): string {
  return content.replace(/\n\n#sarcasm\s+\S[\s\S]*$/u, '').trim();
}

function tagValue(event: Event, name: string): string | undefined {
  const hit = event.tags.find((t) => t[0] === name && t[1]);
  return hit?.[1];
}

function replyParentId(event: Event): string | null {
  const replies = event.tags.filter((t) => t[0] === 'e' && t[1]);
  if (!replies.length) return null;
  const marked = replies.find((t) => t[3] === 'reply');
  return (marked?.[1] || replies[replies.length - 1]?.[1]) ?? null;
}

function replyIdentity(event: Event): {
  pubkey: string | null;
  displayName: string | null;
} {
  const replyTag = event.tags.find(
    (item) => item[0] === 'rp' && /^[0-9a-f]{64}$/i.test(item[1] ?? ''),
  );
  const tag = replyTag ?? event.tags.find(
    (item) => item[0] === 'p' && /^[0-9a-f]{64}$/i.test(item[1] ?? ''),
  );
  return {
    pubkey: tag?.[1]?.toLowerCase() ?? null,
    displayName: (replyTag?.[2] ?? tag?.[3])?.trim() || null,
  };
}

function isSarcasmEvent(event: Event, platform: string, videoId: string): boolean {
  const i = tagValue(event, 'i');
  const expected = `${platform}:${videoId}`;
  if (i === expected) return true;
  if (event.content.includes(`#sarcasm ${expected}`)) return true;
  const client = tagValue(event, 'client');
  return client === 'sarcasm' && i?.startsWith(`${platform}:`) === true && i === expected;
}

function eventToComment(
  event: Event,
  platform: AnchorRuleId,
  videoId: string,
): CommentRecord | null {
  if (!isSarcasmEvent(event, platform, videoId)) return null;
  const body = parseSarcasmBody(event.content);
  if (!body) return null;

  const author =
    tagValue(event, 'n')?.trim() || shortNpub(event.pubkey);
  const reply = replyIdentity(event);

  const createdAt = event.created_at * 1000;
  return {
    id: event.id,
    platform,
    videoId,
    parentId: replyParentId(event),
    nativeParentId: null,
    replyToAuthor: reply.displayName,
    replyToPubkey: reply.pubkey,
    author,
    authorPubkey: event.pubkey,
    body,
    likes: 0,
    dislikes: 0,
    myVote: null,
    createdAt,
    updatedAt: createdAt,
  };
}

/** 从 relay 拉取当前内容下的 sarcasm 评论并写入本机（无需私钥） */
export async function pullCommentsFromNostr(
  input: PullCommentsInput,
): Promise<PullCommentsResult> {
  const settings = await loadNostrSettings();
  if (!settings.relays.length) {
    return { fetched: 0, imported: 0, error: '未配置 relay' };
  }

  const filter = {
    kinds: [1],
    '#i': [`${input.platform}:${input.videoId}`],
    limit: 200,
  };

  const pool = new SimplePool();
  try {
    const events = await pool.querySync(settings.relays, filter, {
      maxWait: 5_000,
    });
    const rows = events
      .map((event) => ({
        event,
        row: eventToComment(event, input.platform, input.videoId),
      }))
      .filter(
        (item): item is { event: Event; row: CommentRecord } => item.row !== null,
      );
    const namesByPubkey = new Map<string, string>();
    for (const { row } of rows) {
      if (
        row.authorPubkey &&
        row.author &&
        row.author !== shortNpub(row.authorPubkey)
      ) {
        namesByPubkey.set(row.authorPubkey.toLowerCase(), row.author);
      }
    }

    let imported = 0;
    for (const { event, row } of rows) {
      if (!row.replyToAuthor && row.replyToPubkey) {
        row.replyToAuthor = namesByPubkey.get(row.replyToPubkey) ?? null;
      }
      const localHint = tagValue(event, 'c') ?? null;
      const result = await absorbRemoteComment(row, localHint);
      if (result === 'inserted' || result === 'merged') imported += 1;
    }
    return { fetched: events.length, imported };
  } catch (e) {
    return {
      fetched: 0,
      imported: 0,
      error: e instanceof Error ? e.message : String(e),
    };
  } finally {
    pool.close(settings.relays);
  }
}
