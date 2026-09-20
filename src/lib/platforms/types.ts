import type { PageContext, Platform } from '../db/types';

export interface NativeCommentHit {
  id: string;
  preview: string;
  element: HTMLElement;
}

export interface PlatformAdapter {
  platform: Platform;
  match(url: URL): boolean;
  readContext(url: URL, doc: Document): PageContext | null;
  /** 从页面扫描可锚定的原生评论 */
  scanNativeComments(doc: Document): NativeCommentHit[];
  /** SPA 路由变化时需要重新读上下文 */
  observeNavigation(onChange: () => void): () => void;
}
