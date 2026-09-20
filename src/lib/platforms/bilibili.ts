import type { PageContext } from '../db/types';
import type { NativeCommentHit, PlatformAdapter } from './types';

function readTitle(doc: Document): string | undefined {
  const h1 = doc.querySelector('h1, .video-title, [class*="video-title"]');
  const text = h1?.textContent?.trim();
  return text || doc.title.replace(/_哔哩哔哩.*$/, '').trim() || undefined;
}

function extractBvid(url: URL): string | null {
  const fromPath = url.pathname.match(/\/video\/(BV[\w]+)/i);
  if (fromPath) return fromPath[1];
  const fromQuery = url.searchParams.get('bvid');
  if (fromQuery?.startsWith('BV')) return fromQuery;
  return null;
}

function extractAid(url: URL, doc: Document): string | null {
  const fromPath = url.pathname.match(/\/video\/av(\d+)/i);
  if (fromPath) return `av${fromPath[1]}`;
  const aidMeta = doc.querySelector('meta[itemprop="url"]')?.getAttribute('content');
  const aidFromMeta = aidMeta?.match(/\/video\/av(\d+)/);
  if (aidFromMeta) return `av${aidFromMeta[1]}`;
  return null;
}

function cleanPreview(text: string): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, 80);
}

export const bilibiliAdapter: PlatformAdapter = {
  platform: 'bilibili',

  match(url) {
    return /(^|\.)bilibili\.com$/i.test(url.hostname) && /\/video\//.test(url.pathname);
  },

  readContext(url, doc): PageContext | null {
    const videoId = extractBvid(url) || extractAid(url, doc);
    if (!videoId) return null;
    return {
      platform: 'bilibili',
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
        '[data-root-reply-id]',
        '[data-reply-id]',
        '[data-rpid]',
        'bili-comment-thread-renderer',
        '.reply-item',
        '.comment-item',
      ].join(','),
    );

    for (const el of candidates) {
      const id =
        el.getAttribute('data-root-reply-id') ||
        el.getAttribute('data-reply-id') ||
        el.getAttribute('data-rpid') ||
        el.getAttribute('rpid') ||
        el.dataset.rootReplyId ||
        el.dataset.replyId ||
        el.dataset.rpid;

      if (!id || seen.has(id)) continue;

      const textEl =
        el.querySelector('.reply-content, .content-text, .text, [class*="content"]') ?? el;
      const preview = cleanPreview(textEl.textContent || '');
      if (!preview) continue;

      seen.add(id);
      hits.push({ id, preview, element: el });
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
    const timer = window.setInterval(tick, 800);
    window.addEventListener('popstate', tick);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('popstate', tick);
    };
  },
};
