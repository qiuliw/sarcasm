import { bilibiliAdapter } from './bilibili';
import { douyinAdapter } from './douyin';
import type { PlatformAdapter } from './types';
import type { PageContext } from '../db/types';

const adapters: PlatformAdapter[] = [bilibiliAdapter, douyinAdapter];

export function resolveAdapter(url = new URL(location.href)): PlatformAdapter | null {
  return adapters.find((a) => a.match(url)) ?? null;
}

export function readPageContext(doc = document, href = location.href): PageContext | null {
  const url = new URL(href);
  const adapter = resolveAdapter(url);
  if (!adapter) return null;
  return adapter.readContext(url, doc);
}

export { bilibiliAdapter, douyinAdapter };
