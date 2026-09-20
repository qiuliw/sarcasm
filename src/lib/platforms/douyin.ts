import { hostMatches, type PlatformAdapter } from './types';

const TITLE_SELS = [
  '[data-e2e="browse-video-desc"]',
  '[data-e2e="video-desc"]',
  '[data-e2e="video-desc-content"]',
  '.video-info-detail',
];

const SCOPE_SELS = [
  '[data-e2e="feed-item"]',
  '[data-e2e="feed-active-video"]',
  '[data-e2e="browse-video"]',
  '[class*="swiper-slide"]',
  '[class*="video-info"]',
  'li',
  'article',
  'section',
];

function isLiveHostOrPath(url: URL): boolean {
  const host = url.hostname.toLowerCase();
  if (host === 'live.douyin.com' || host.endsWith('.live.douyin.com')) return true;
  return url.pathname.startsWith('/live');
}

function findVideoId(url: URL, doc: Document): string | null {
  const path = url.pathname.match(/\/video\/(\d+)/);
  if (path?.[1]) return path[1];

  const modal = url.searchParams.get('modal_id');
  if (modal && /^\d+$/.test(modal)) return modal;

  try {
    const m = doc.documentElement.innerHTML.match(/"awemeId"\s*:\s*"(\d+)"/);
    if (m?.[1]) return m[1];
  } catch {
    // ignore
  }
  return null;
}

function scopeOf(el: Element): Element {
  for (const sel of SCOPE_SELS) {
    try {
      const hit = el.closest(sel);
      if (hit) return hit;
    } catch {
      // ignore
    }
  }
  return el.parentElement ?? el;
}

function scopeOwnsId(scope: Element, videoId: string): boolean {
  try {
    if (scope.querySelector(`[href*="${CSS.escape(videoId)}"]`)) return true;
    if (
      scope.querySelector(
        `[data-aweme-id="${CSS.escape(videoId)}"], [data-video-id="${CSS.escape(videoId)}"]`,
      )
    ) {
      return true;
    }
  } catch {
    try {
      if (scope.querySelector(`[href*="${videoId}"]`)) return true;
    } catch {
      // ignore
    }
  }
  const html = scope.outerHTML;
  if (html.length > 400_000) return false;
  return (
    html.includes(`/video/${videoId}`) ||
    html.includes(`modal_id=${videoId}`) ||
    html.includes(`"awemeId":"${videoId}"`) ||
    html.includes(`"aweme_id":"${videoId}"`) ||
    html.includes(`"awemeId":${videoId}`) ||
    html.includes(`"aweme_id":${videoId}`)
  );
}

function visibilityScore(el: Element): number {
  const rect = el.getBoundingClientRect?.();
  if (!rect || rect.width < 2 || rect.height < 2) return 0;
  const vw = window.innerWidth || 1;
  const vh = window.innerHeight || 1;
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  if (cx < 0 || cy < 0 || cx > vw || cy > vh) return 1;
  const dx = (cx - vw / 2) / vw;
  const dy = (cy - vh / 2) / vh;
  return Math.max(2, Math.round(40 - Math.sqrt(dx * dx + dy * dy) * 40));
}

function findTitle(doc: Document, videoId: string): string | undefined {
  const candidates: Element[] = [];
  const seen = new Set<Element>();
  for (const sel of TITLE_SELS) {
    try {
      for (const el of doc.querySelectorAll(sel)) {
        if (seen.has(el)) continue;
        if (!el.textContent?.trim()) continue;
        seen.add(el);
        candidates.push(el);
      }
    } catch {
      // ignore
    }
  }

  if (candidates.length) {
    let best: Element | null = null;
    let bestScore = -1;
    for (const el of candidates) {
      const scope = scopeOf(el);
      const score =
        (scopeOwnsId(scope, videoId) ? 1000 : 0) + visibilityScore(el);
      if (score > bestScore) {
        bestScore = score;
        best = el;
      }
    }
    const text = best?.textContent?.trim();
    if (text) return text.slice(0, 120);
  }

  const t = doc.title?.trim();
  return t ? t.slice(0, 120) : undefined;
}

/** 抖音短视频 / 精选 modal */
export const douyinVideo: PlatformAdapter = {
  id: 'douyin',
  site: '抖音',
  kind: 'video',
  name: '抖音·视频',
  version: 1,
  hosts: ['douyin.com'],

  match(url) {
    if (!hostMatches(url.hostname, this.hosts)) return false;
    if (isLiveHostOrPath(url)) return false;
    return true;
  },

  resolve(url, doc) {
    if (!this.match(url)) return null;
    const videoId = findVideoId(url, doc);
    if (!videoId) return null;
    return {
      videoId,
      title: findTitle(doc, videoId),
    };
  },
};

/** @deprecated 使用 douyinVideo */
export const douyin = douyinVideo;
