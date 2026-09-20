import {
  BUILTIN_PACKS,
  extractVideoId,
  packMatches,
  readTitle,
  validatePack,
  type AnchorPack,
} from './packs';
import type { PageContext } from '../db/types';

const CUSTOM_KEY = 'sarcasm_anchor_packs_v1';

export async function loadCustomPacks(): Promise<AnchorPack[]> {
  const stored = await browser.storage.local.get(CUSTOM_KEY);
  const raw = stored[CUSTOM_KEY];
  if (!Array.isArray(raw)) return [];
  const out: AnchorPack[] = [];
  for (const item of raw) {
    try {
      out.push(validatePack(item));
    } catch {
      // skip bad
    }
  }
  return out;
}

/** 自定义覆盖同 id 内置；其余追加 */
export async function loadAllPacks(): Promise<AnchorPack[]> {
  const custom = await loadCustomPacks();
  const byId = new Map<string, AnchorPack>();
  for (const p of BUILTIN_PACKS) byId.set(p.id, p);
  for (const p of custom) byId.set(p.id, p);
  return [...byId.values()];
}

export async function saveCustomPacks(packs: AnchorPack[]): Promise<AnchorPack[]> {
  const cleaned = packs.map(validatePack);
  await browser.storage.local.set({ [CUSTOM_KEY]: cleaned });
  return cleaned;
}

export async function importPacksJson(text: string): Promise<AnchorPack[]> {
  const parsed = JSON.parse(text) as unknown;
  const list = Array.isArray(parsed) ? parsed : [parsed];
  const incoming = list.map(validatePack);
  const current = await loadCustomPacks();
  const byId = new Map(current.map((p) => [p.id, p]));
  for (const p of incoming) byId.set(p.id, p);
  return saveCustomPacks([...byId.values()]);
}

export async function exportPacksJson(includeBuiltin = true): Promise<string> {
  const packs = includeBuiltin ? await loadAllPacks() : await loadCustomPacks();
  return `${JSON.stringify(packs, null, 2)}\n`;
}

export async function resolvePageContext(
  doc = document,
  href = location.href,
): Promise<PageContext | null> {
  const url = new URL(href);
  const packs = await loadAllPacks();
  for (const pack of packs) {
    if (!packMatches(pack, url)) continue;
    const videoId = extractVideoId(pack, url, doc);
    if (!videoId) continue;
    return {
      platform: pack.id,
      videoId,
      title: readTitle(pack, doc),
      url: url.href,
    };
  }
  return null;
}

export function resolvePageContextSync(
  packs: AnchorPack[],
  doc = document,
  href = location.href,
): PageContext | null {
  const url = new URL(href);
  for (const pack of packs) {
    if (!packMatches(pack, url)) continue;
    const videoId = extractVideoId(pack, url, doc);
    if (!videoId) continue;
    return {
      platform: pack.id,
      videoId,
      title: readTitle(pack, doc),
      url: url.href,
    };
  }
  return null;
}

export function observeHref(onChange: () => void, intervalMs = 700): () => void {
  let last = location.href;
  const tick = () => {
    if (location.href !== last) {
      last = location.href;
      onChange();
    }
  };
  const timer = window.setInterval(tick, intervalMs);
  window.addEventListener('popstate', tick);
  return () => {
    window.clearInterval(timer);
    window.removeEventListener('popstate', tick);
  };
}
