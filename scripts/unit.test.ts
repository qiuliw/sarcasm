import { describe, expect, test } from 'bun:test';
import { resolvePageContextSync } from '../src/lib/anchors/resolve';
import {
  BUILTIN_PACKS,
  extractVideoId,
  parseRulesDocument,
  validatePack,
} from '../src/lib/anchors/packs';
import { parseSarcasmBody } from '../src/lib/nostr/fetch';
import { buildCommentTemplate } from '../src/lib/nostr/publish';
import { buildCommentForest, resolveOverlayReply } from '../src/lib/db/tree';
import type { CommentRecord } from '../src/lib/db/types';
import { applyVote } from '../src/lib/db/vote';
import {
  createSecretKey,
  pubkeyToNpub,
  secretToNsec,
  secretToPubkey,
  shortNpub,
} from '../src/lib/nostr/keys';
import { DEFAULT_RELAYS, identityFromSettings } from '../src/lib/nostr/settings';
import { probeRelay } from '../src/lib/nostr/probe';
import { isMeaningfulDraft, videoDraftKey } from '../src/lib/prefs/draft';

function comment(partial: Partial<CommentRecord> & Pick<CommentRecord, 'id' | 'body'>): CommentRecord {
  return {
    platform: 'bilibili-video',
    videoId: 'BV1',
    parentId: null,
    nativeParentId: null,
    replyToAuthor: null,
    replyToPubkey: null,
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
  test('reply to root keeps target identity', () => {
    const root = comment({
      id: 'v1',
      body: 'hi',
      author: 'Alice',
      authorPubkey: 'a'.repeat(64),
    });
    expect(resolveOverlayReply(root)).toEqual({
      threadRootId: 'v1',
      replyToAuthor: 'Alice',
      replyToPubkey: 'a'.repeat(64),
    });
  });

  test('reply to L2 still under same root with @L2 author', () => {
    const child = comment({
      id: 'c1',
      body: 'yo',
      parentId: 'v1',
      author: 'Bob',
      authorPubkey: 'b'.repeat(64),
      replyToAuthor: 'Alice',
    });
    expect(resolveOverlayReply(child)).toEqual({
      threadRootId: 'v1',
      replyToAuthor: 'Bob',
      replyToPubkey: 'b'.repeat(64),
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
    expect(videoDraftKey('bilibili-video', 'BV1')).toBe('bilibili-video:BV1');
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

  test('falls back to npub when display name is empty', () => {
    const sk = createSecretKey();
    const pubkey = secretToPubkey(sk);
    const base = { nsec: secretToNsec(sk), relays: [] };
    expect(identityFromSettings({ ...base, displayName: '' }).shortLabel).toBe(
      shortNpub(pubkey),
    );
    expect(identityFromSettings({ ...base, displayName: 'Alice' }).shortLabel).toBe(
      'Alice',
    );
  });
});

describe('nostr defaults', () => {
  test('uses multiple live relay defaults', () => {
    expect(DEFAULT_RELAYS.length).toBeGreaterThanOrEqual(5);
    expect(DEFAULT_RELAYS).toContain('wss://relay.primal.net');
    expect(DEFAULT_RELAYS).not.toContain('wss://relay.nostr.band');
  });
});

describe('nostr relay probe', () => {
  test('rejects non-wss relay addresses without opening a socket', async () => {
    const result = await probeRelay('https://relay.example.com');
    expect(result.ok).toBe(false);
    expect(result.error).toBe('仅支持 wss://');
  });
});

describe('nostr pull parse', () => {
  test('strips sarcasm footer from content', () => {
    expect(parseSarcasmBody('你好\n\n#sarcasm douyin:123')).toBe('你好');
    expect(parseSarcasmBody('纯文本')).toBe('纯文本');
  });
});

describe('nostr reply identity', () => {
  test('publishes reply pubkey and display-name hint', () => {
    const pubkey = 'a'.repeat(64);
    const template = buildCommentTemplate({
      platform: 'bilibili-video',
      videoId: 'BV1',
      body: 'reply',
      parentCommentId: 'event-id',
      replyToPubkey: pubkey,
      replyToAuthor: 'Alice',
    });
    expect(template.tags).toContainEqual(['p', pubkey]);
    expect(template.tags).toContainEqual(['rp', pubkey, 'Alice']);
  });
});

describe('anchor rules', () => {
  test('built-in fixtures stay valid', () => {
    const fixtures = [
      {
        packId: 'bilibili-video',
        url: 'https://www.bilibili.com/video/BV1GJ411x7h7/',
        expectedId: 'BV1GJ411x7h7',
      },
      {
        packId: 'douyin-video',
        url: 'https://www.douyin.com/video/7123456789012345678',
        expectedId: '7123456789012345678',
      },
      {
        packId: 'douyin-video',
        url: 'https://www.douyin.com/jingxuan?modal_id=7654524171870899499',
        expectedId: '7654524171870899499',
      },
      {
        packId: 'bilibili-article',
        url: 'https://www.bilibili.com/read/cv123456',
        expectedId: 'cv123456',
      },
      {
        packId: 'bilibili-article',
        url: 'https://www.bilibili.com/opus/987654321',
        expectedId: 'opus987654321',
      },
    ];
    for (const fixture of fixtures) {
      const pack = BUILTIN_PACKS.find((item) => item.id === fixture.packId)!;
      expect(extractVideoId(pack, new URL(fixture.url))).toBe(fixture.expectedId);
    }
  });

  test('resolvePageContext picks matching rule', () => {
    const ctx = resolvePageContextSync(
      BUILTIN_PACKS,
      'https://www.bilibili.com/video/BV1GJ411x7h7/',
    );
    expect(ctx?.platform).toBe('bilibili-video');
    expect(ctx?.videoId).toBe('BV1GJ411x7h7');
  });

  test('accepts an imported URL-only rule', () => {
    const pack = validatePack({
      id: 'example',
      name: 'Example',
      hosts: ['example.com'],
      videoIdRules: [{ from: 'query', queryKey: 'video', pattern: '^(\\d+)$' }],
    });
    const ctx = resolvePageContextSync(
      [pack],
      'https://watch.example.com/play?video=42',
    );
    expect(ctx?.platform).toBe('example');
    expect(ctx?.videoId).toBe('42');
  });

  test('maps changed platform IDs to a stable anchor', () => {
    const pack = validatePack({
      id: 'example',
      name: 'Example',
      hosts: ['example.com'],
      videoIdRules: [{ from: 'query', queryKey: 'video', pattern: '^(\\d+)$' }],
      aliases: { '9001': '42' },
    });
    expect(
      extractVideoId(pack, new URL('https://example.com/watch?video=9001')),
    ).toBe('42');
  });

  test('rejects unsupported rule document versions', () => {
    expect(() => parseRulesDocument({ schemaVersion: 2, packs: [] })).toThrow(
      '不支持规则格式 v2',
    );
  });
});
