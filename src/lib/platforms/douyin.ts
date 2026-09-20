import type { PageContext } from '../db/types';
import type { PlatformAdapter } from './types';

function extractVideoId(url: URL, doc: Document): string | null {
  const fromPath = url.pathname.match(/\/video\/(\d+)/);
  if (fromPath) return fromPath[1] ?? null;

  const modal = url.searchParams.get('modal_id');
  if (modal && /^\d+$/.test(modal)) return modal;

  const note = doc.querySelector('[data-e2e="feed-active-video"], [data-e2e="video-detail"]');
  const fromAttr =
    note?.getAttribute('data-video-id') ||
    note?.getAttribute('data-id') ||
    (note as HTMLElement | null)?.dataset?.videoId;
  if (fromAttr && /^\d+$/.test(fromAttr)) return fromAttr;

  const htmlHit = doc.documentElement.innerHTML.match(/"awemeId"\s*:\s*"(\d+)"/);
  if (htmlHit) return htmlHit[1] ?? null;

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
