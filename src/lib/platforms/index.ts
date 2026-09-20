import type { PageContext } from '../db/types';
import {
  loadAllPacks,
  observeHref,
  resolvePageContext,
  resolvePageContextSync,
} from '../anchors/store';
import type { AnchorPack } from '../anchors/packs';

/** @deprecated 用锚点规则包；保留给旧测试的薄封装 */
export async function readPageContext(
  doc = document,
  href = location.href,
): Promise<PageContext | null> {
  return resolvePageContext(doc, href);
}

export function readPageContextWithPacks(
  packs: AnchorPack[],
  doc = document,
  href = location.href,
): PageContext | null {
  return resolvePageContextSync(packs, doc, href);
}

export { loadAllPacks, observeHref, resolvePageContextSync };
