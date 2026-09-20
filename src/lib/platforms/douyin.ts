import type { PageContext } from '../db/types';
import type { NativeCommentHit, PlatformAdapter } from './types';

function cleanPreview(text: string): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, 80);
}

function extractVideoId(url: URL, doc: Document): string | null {
  const fromPath = url.pathname.match(/\/video\/(\d+)/);
  if (fromPath) return fromPath[1];

  // 推荐流 / 模态播放：常见 modal_id / 路径片段
  const modal = url.searchParams.get('modal_id');
  if (modal && /^\d+$/.test(modal)) return modal;

  const note = doc.querySelector('[data-e2e="feed-active-video"], [data-e2e="video-detail"]');
  const fromAttr =
    note?.getAttribute('data-video-id') ||
    note?.getAttribute('data-id') ||
    (note as HTMLElement | null)?.dataset?.videoId;
  if (fromAttr && /^\d+$/.test(fromAttr)) return fromAttr;

  // 页面里偶发出现 aweme id
  const htmlHit = doc.documentElement.innerHTML.match(/"awemeId"\s*:\s*"(\d+)"/);
  if (htmlHit) return htmlHit[1];

  return null;
}

function readTitle(doc: Document): string | undefined {
  const desc = doc.querySelector(
    '[data-e2e="video-desc"], [data-e2e="browse-video-desc"], .video-info-detail',
  );
  const text = desc?.textContent?.trim();
  return text?.slice(0, 120) || undefined;
}

export const douyinAdapter: PlatformAdapter = {
  platform: 'douyin',

  match(url) {
    return /(^|\.)douyin\.com$/i.test(url.hostname);
  },

  readContext(url, doc): PageContext | null {
    if (!this.match(url)) return null;
    const videoId = extractVideoId(url, doc);
    if (!videoId) return null;
    return {
      platform: 'douyin',
      videoId,
      title: readTitle(doc),
      url: url.href,
    };
  },

  scanNativeComments(doc): NativeCommentHit[] {
    const hits: NativeCommentHit[] = [];
    const seen = new Set<string>();

    const candidates = doc.querySelectorAll<HTMLElement>(
      [
        '[data-e2e="comment-item"]',
        '[data-e2e="comment-list"] [class*="CommentItem"]',
        '[class*="comment-item"]',
        'li[class*="Comment"]',
      ].join(','),
    );

    for (const el of candidates) {
      const id =
        el.getAttribute('data-id') ||
        el.getAttribute('data-comment-id') ||
        el.dataset.id ||
        el.dataset.commentId ||
        // 退化：用文本 hash 的不稳定锚点前缀，后续可换成稳定 id
        undefined;

      let stableId = id;
      if (!stableId) {
        const text = cleanPreview(el.textContent || '');
        if (!text) continue;
        stableId = `hash:${simpleHash(text)}`;
      }
      if (seen.has(stableId)) continue;

      const textEl =
        el.querySelector('[data-e2e="comment-level-1"], [class*="content"], p, span') ?? el;
      const preview = cleanPreview(textEl.textContent || '');
      if (!preview) continue;

      seen.add(stableId);
      hits.push({ id: stableId, preview, element: el });
    }

    return hits;
  },

  observeNavigation(onChange) {
    let last = location.href;
    const tick = () => {
      if (location.href !== last) {
        last = location.href;
        onChange();
      }
    };
    const timer = window.setInterval(tick, 600);
    window.addEventListener('popstate', tick);
    const mo = new MutationObserver(() => tick());
    mo.observe(document.documentElement, { childList: true, subtree: true });
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('popstate', tick);
      mo.disconnect();
    };
  },
};

function simpleHash(input: string): string {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}
