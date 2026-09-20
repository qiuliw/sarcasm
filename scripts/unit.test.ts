import { describe, expect, test } from 'bun:test';
import { bilibili, douyin, resolvePageContext } from '../src/lib/platforms';
import { parseSarcasmBody } from '../src/lib/nostr/fetch';
import { buildCommentForest, resolveOverlayReply } from '../src/lib/db/tree';
import type { CommentRecord } from '../src/lib/db/types';
import { applyVote } from '../src/lib/db/vote';
import { createSecretKey, pubkeyToNpub, secretToPubkey, shortNpub } from '../src/lib/nostr/keys';
import { isMeaningfulDraft, videoDraftKey } from '../src/lib/prefs/draft';

function comment(partial: Partial<CommentRecord> & Pick<CommentRecord, 'id' | 'body'>): CommentRecord {
  return {
    platform: 'bilibili',
    videoId: 'BV1',
    parentId: null,
    nativeParentId: null,
    replyToAuthor: null,
    author: 'me',
    authorPubkey: null,
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
      comment({ id: 'c2', body: 'deep', parentId: 'c1', replyToAuthor: 'C', author: 'D' }),
    ];
    const forest = buildCommentForest(rows);
    expect(forest.videoRoots).toHaveLength(1);
    const root = forest.videoRoots[0]!;
    expect(root.children.map((c) => c.id).sort()).toEqual(['c1', 'c2']);
    expect(root.children.every((c) => c.children.length === 0)).toBe(true);
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
    expect(isMeaningfulDraft({ body: '', replyTarget: { kind: 'video' } })).toBe(false);
    expect(isMeaningfulDraft({ body: 'hi', replyTarget: { kind: 'video' } })).toBe(true);
  });
});

describe('nostr keys', () => {
  test('generates npub short label', () => {
    const sk = createSecretKey();
    const npub = pubkeyToNpub(secretToPubkey(sk));
    expect(npub.startsWith('npub1')).toBe(true);
    expect(shortNpub(npub).includes('…')).toBe(true);
  });
});

describe('nostr pull parse', () => {
  test('strips sarcasm footer from content', () => {
    expect(parseSarcasmBody('你好\n\n#sarcasm douyin:123')).toBe('你好');
    expect(parseSarcasmBody('纯文本')).toBe('纯文本');
  });
});

describe('platform adapters', () => {
  const emptyDoc = {
    title: 'demo',
    querySelector: () => null,
    querySelectorAll: () => [],
    documentElement: { innerHTML: '' },
  } as unknown as Document;

  test('bilibili extracts BV id', () => {
    const url = new URL('https://www.bilibili.com/video/BV1GJ411x7h7/?spm=1');
    expect(bilibili.match(url)).toBe(true);
    expect(bilibili.resolve(url, emptyDoc)?.videoId).toBe('BV1GJ411x7h7');
  });

  test('douyin extracts path and modal_id', () => {
    const pathUrl = new URL('https://www.douyin.com/video/7123456789012345678');
    expect(douyin.resolve(pathUrl, emptyDoc)?.videoId).toBe('7123456789012345678');
    const modalUrl = new URL(
      'https://www.douyin.com/jingxuan?modal_id=7654524171870899499',
    );
    expect(douyin.resolve(modalUrl, emptyDoc)?.videoId).toBe('7654524171870899499');
    expect(douyin.kind).toBe('video');
    expect(douyin.name).toBe('抖音·视频');
  });

  test('resolvePageContext picks matching adapter', () => {
    const ctx = resolvePageContext(
      emptyDoc,
      'https://www.bilibili.com/video/BV1GJ411x7h7/',
    );
    expect(ctx?.platform).toBe('bilibili');
    expect(ctx?.videoId).toBe('BV1GJ411x7h7');
  });
});
