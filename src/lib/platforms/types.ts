import type { PageContext, Platform } from '../db/types';

export interface PlatformAdapter {
  platform: Platform;
  match(url: URL): boolean;
  readContext(url: URL, doc: Document): PageContext | null;
  /** SPA 路由变化时需要重新读上下文 */
  observeNavigation(onChange: () => void): () => void;
}
