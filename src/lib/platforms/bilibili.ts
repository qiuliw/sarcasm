import { hostMatches, type PlatformAdapter } from './types';

function pickTitle(doc: Document, selectors: string[], strip?: RegExp): string | undefined {
  for (const sel of selectors) {
    try {
      const text = doc.querySelector(sel)?.textContent?.trim();
      if (!text) continue;
      if (strip) {
        const cleaned = text.replace(strip, '').trim();
        return (cleaned || text).slice(0, 120);
      }
      return text.slice(0, 120);
    } catch {
      // ignore
    }
  }
  const t = doc.title?.trim();
  return t ? t.replace(strip ?? /$/, '').trim().slice(0, 120) || t.slice(0, 120) : undefined;
}

export const bilibili: PlatformAdapter = {
  id: 'bilibili',
  site: 'B站',
  kind: 'video',
  name: 'B站·视频',
  version: 1,
  hosts: ['bilibili.com'],

  match(url) {
    return hostMatches(url.hostname, this.hosts) && url.pathname.includes('/video/');
  },

  resolve(url, doc) {
    if (!this.match(url)) return null;

    let videoId: string | null = null;
    const bv = url.pathname.match(/\/video\/(BV[\w]+)/i);
    if (bv?.[1]) videoId = bv[1];
    if (!videoId) {
      const q = url.searchParams.get('bvid');
      if (q && /^BV[\w]+$/i.test(q)) videoId = q;
    }
    if (!videoId) {
      const av = url.pathname.match(/\/video\/av(\d+)/i);
      if (av?.[1]) videoId = `av${av[1]}`;
    }
    if (!videoId) return null;

    return {
      videoId,
      title: pickTitle(
        doc,
        ['h1', '.video-title', '[class*="video-title"]'],
        /_哔哩哔哩.*$/,
      ),
    };
  },
};
