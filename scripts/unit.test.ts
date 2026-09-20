import { describe, expect, test } from 'bun:test';
import { buildCommentForest, resolveOverlayReply } from '../src/lib/db/tree';
import type { CommentRecord } from '../src/lib/db/types';
import { applyVote } from '../src/lib/db/vote';
import { createSecretKey, pubkeyToNpub, secretToPubkey, shortNpub } from '../src/lib/nostr/keys';
import { isMeaningfulDraft, videoDraftKey } from '../src/lib/prefs/draft';
import { bilibiliAdapter } from '../src/lib/platforms/bilibili';
import { douyinAdapter } from '../src/lib/platforms/douyin';

function comment(partial: Partial<CommentRecord> & Pick<CommentRecord, 'id' | 'body'>): CommentRecord {
  return {
    platform: 'bilibili',
    videoId: 'BV1',
    parentId: null,
    nativeParentId: null,
    replyToAuthor: null,
    author: 'me',
    likes: 0,
    dislikes: 0,
    myVote: null,
    createdAt: 1,
    updatedAt: 1,
    ...partial,
  };
}

describe('buildCommentForest', () => {
  test('keeps only two levels and hoists deeper parents', () => {
    const rows = [
      comment({ id: 'v1', body: 'on video', author: 'A' }),
      comment({ id: 'c1', body: 'child', parentId: 'v1', replyToAuthor: 'A', author: 'C' }),
      // 误写成三级：应提升到 v1 下
      comment({ id: 'c2', body: 'deep', parentId: 'c1', replyToAuthor: 'C', author: 'D' }),
    ];
    const forest = buildCommentForest(rows);
    expect(forest.videoRoots).toHaveLength(1);
    expect(forest.videoRoots[0].children.map((c) => c.id).sort()).toEqual(['c1', 'c2']);
    expect(forest.videoRoots[0].children.every((c) => c.children.length === 0)).toBe(true);
  });
});

describe('resolveOverlayReply', () => {
  test('reply to root stays under root without @', () => {
    const root = comment({ id: 'v1', body: 'hi', author: 'Alice' });
    expect(resolveOverlayReply(root)).toEqual({
      threadRootId: 'v1',
      replyToAuthor: null,
    });
  });

  test('reply to L2 still under same root with @L2 author', () => {
    const child = comment({
      id: 'c1',
      body: 'yo',
      parentId: 'v1',
      author: 'Bob',
      replyToAuthor: 'Alice',
    });
    expect(resolveOverlayReply(child)).toEqual({
      threadRootId: 'v1',
      replyToAuthor: 'Bob',
    });
  });
});

describe('applyVote', () => {
  test('toggles like and switches from dislike', () => {
    expect(applyVote({ likes: 0, dislikes: 0, myVote: null }, 'up')).toEqual({
      likes: 1,
      dislikes: 0,
      myVote: 'up',
    });
    expect(applyVote({ likes: 1, dislikes: 0, myVote: 'up' }, 'up')).toEqual({
      likes: 0,
      dislikes: 0,
      myVote: null,
    });
    expect(applyVote({ likes: 0, dislikes: 1, myVote: 'down' }, 'up')).toEqual({
      likes: 1,
      dislikes: 0,
      myVote: 'up',
    });
  });
});

describe('composer drafts', () => {
  test('keys by platform and video, and ignores empty drafts', () => {
    expect(videoDraftKey('bilibili', 'BV1')).toBe('bilibili:BV1');
    expect(
      isMeaningfulDraft({ body: '', replyTarget: { kind: 'video' } }),
    ).toBe(false);
    expect(
      isMeaningfulDraft({ body: 'hi', replyTarget: { kind: 'video' } }),
    ).toBe(true);
    expect(
      isMeaningfulDraft({
        body: '',
        replyTarget: { kind: 'overlay_comment', targetId: 'c1' },
      }),
    ).toBe(true);
  });
});

describe('nostr keys', () => {
  test('generates npub short label', () => {
    const sk = createSecretKey();
    const npub = pubkeyToNpub(secretToPubkey(sk));
    const label = shortNpub(npub);
    expect(npub.startsWith('npub1')).toBe(true);
    expect(label.includes('…')).toBe(true);
  });
});

describe('platform adapters', () => {
  const emptyDoc = {
    title: 'demo',
    querySelector: () => null,
    documentElement: { innerHTML: '' },
  } as unknown as Document;

  test('bilibili reads BV id', () => {
    const url = new URL('https://www.bilibili.com/video/BV1GJ411x7h7/?spm=1');
    expect(bilibiliAdapter.match(url)).toBe(true);
    const ctx = bilibiliAdapter.readContext(url, emptyDoc);
    expect(ctx?.videoId).toBe('BV1GJ411x7h7');
    expect(ctx?.platform).toBe('bilibili');
  });

  test('douyin reads numeric video id', () => {
    const url = new URL('https://www.douyin.com/video/7123456789012345678');
    expect(douyinAdapter.match(url)).toBe(true);
    const ctx = douyinAdapter.readContext(url, emptyDoc);
    expect(ctx?.videoId).toBe('7123456789012345678');
  });
});
