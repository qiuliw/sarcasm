import type { PageContext } from '../db/types';
import { extractVideoId, packMatches, type AnchorPack } from './packs';
import { loadAllPacks } from './store';

export async function resolvePageContext(href = location.href): Promise<PageContext | null> {
  return resolvePageContextSync(await loadAllPacks(), href);
}

export function resolvePageContextSync(
  packs: AnchorPack[],
  href = location.href,
): PageContext | null {
  const url = new URL(href);
  for (const pack of packs) {
    if (!packMatches(pack, url)) continue;
    const videoId = extractVideoId(pack, url);
    if (!videoId) continue;
    return {
      platform: pack.id,
      platformName: pack.name,
      videoId,
      url: url.href,
    };
  }
  return null;
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
