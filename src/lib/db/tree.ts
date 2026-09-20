import type { CommentRecord, CommentTreeNode } from './types';

/**
 * 组装最多两级的评论树：
 * - 一级：回复视频 / 锚定原生评论
 * - 二级：全部挂在一级下（历史若误写成更深 parent，会提升到一级）
 */
export function buildCommentForest(rows: CommentRecord[]): {
  videoRoots: CommentTreeNode[];
  byNativeParent: Record<string, CommentTreeNode[]>;
} {
  const nodes = new Map<string, CommentTreeNode>();
  for (const row of rows) {
    nodes.set(row.id, { ...row, children: [] });
  }

  const findThreadRootId = (startId: string): string => {
    let current = nodes.get(startId);
    const seen = new Set<string>();
    while (current?.parentId && nodes.has(current.parentId) && !seen.has(current.id)) {
      seen.add(current.id);
      current = nodes.get(current.parentId);
    }
    return current?.id ?? startId;
  };

  const videoRoots: CommentTreeNode[] = [];
  const byNativeParent: Record<string, CommentTreeNode[]> = {};

  for (const node of nodes.values()) {
    if (node.parentId && nodes.has(node.parentId)) {
      const rootId = findThreadRootId(node.parentId);
      // 避免把自己挂到自己
      if (rootId === node.id) {
        pushRoot(node, videoRoots, byNativeParent);
        continue;
      }
      const root = nodes.get(rootId)!;
      // 二级节点不应再带 children
      node.children = [];
      root.children.push(node);
      continue;
    }
    pushRoot(node, videoRoots, byNativeParent);
  }

  return { videoRoots, byNativeParent };
}

function pushRoot(
  node: CommentTreeNode,
  videoRoots: CommentTreeNode[],
  byNativeParent: Record<string, CommentTreeNode[]>,
) {
  if (node.nativeParentId) {
    const bucket = byNativeParent[node.nativeParentId] ?? [];
    bucket.push(node);
    byNativeParent[node.nativeParentId] = bucket;
    return;
  }
  videoRoots.push(node);
}

/** 点击某条外挂评论回复时，解析两级楼目标 */
export function resolveOverlayReply(node: CommentRecord): {
  threadRootId: string;
  replyToAuthor: string | null;
} {
  if (node.parentId) {
    // 回复二级：仍挂在一级下，并 @ 被回复者
    return {
      threadRootId: node.parentId,
      replyToAuthor: node.author,
    };
  }
  // 回复一级：不需要 @
  return {
    threadRootId: node.id,
    replyToAuthor: null,
  };
}
