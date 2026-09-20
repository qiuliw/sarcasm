import { bilibili } from './bilibili';
import { douyinVideo } from './douyin';
import type { PlatformAdapter } from './types';
import type { PageContext } from '../db/types';

const ADAPTERS: PlatformAdapter[] = [douyinVideo, bilibili];

export function listPlatformAdapters(): PlatformAdapter[] {
  return [...ADAPTERS];
}

export function getPlatformAdapter(id: string): PlatformAdapter | undefined {
  return ADAPTERS.find((a) => a.id === id);
}

export function resolvePageContext(
  doc = document,
  href = location.href,
): PageContext | null {
  const url = new URL(href);
  for (const adapter of ADAPTERS) {
    if (!adapter.match(url)) continue;
    const hit = adapter.resolve(url, doc);
    if (!hit) continue;
    return {
      platform: adapter.id,
      videoId: hit.videoId,
      title: hit.title,
      url: url.href,
    };
  }
  return null;
}

/** @deprecated 旧签名兼容；适配器已内置，忽略 packs 参数 */
export function resolvePageContextSync(
  _packs: unknown,
  doc = document,
  href = location.href,
): PageContext | null {
  return resolvePageContext(doc, href);
}

export function observeHref(onChange: () => void, intervalMs = 400): () => void {
  let last = location.href;
  const tick = () => {
    if (location.href !== last) {
      last = location.href;
      onChange();
    }
  };
  const timer = window.setInterval(tick, intervalMs);
  window.addEventListener('popstate', tick);
  const push = history.pushState.bind(history);
  const replace = history.replaceState.bind(history);
  history.pushState = function (...args) {
    push(...args);
    tick();
  };
  history.replaceState = function (...args) {
    replace(...args);
    tick();
  };
  return () => {
    window.clearInterval(timer);
    window.removeEventListener('popstate', tick);
    history.pushState = push;
    history.replaceState = replace;
  };
}
