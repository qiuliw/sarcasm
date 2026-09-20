import type { CommentRecord, CommentTreeNode } from './types';

/**
 * 组装最多两级的评论树：
 * - 一级：回复当前内容
 * - 二级：全部挂在一级下（历史若误写成更深 parent，会提升到一级）
 */
export function buildCommentForest(rows: CommentRecord[]): {
  videoRoots: CommentTreeNode[];
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

  for (const node of nodes.values()) {
    if (node.parentId && nodes.has(node.parentId)) {
      const rootId = findThreadRootId(node.parentId);
      if (rootId === node.id) {
        videoRoots.push(node);
        continue;
      }
      const root = nodes.get(rootId)!;
      node.children = [];
      root.children.push(node);
      continue;
    }
    videoRoots.push(node);
  }

  return { videoRoots };
}

/** 点击某条外挂评论回复时，解析两级楼目标 */
export function resolveOverlayReply(node: CommentRecord): {
  threadRootId: string;
  replyToAuthor: string | null;
} {
  if (node.parentId) {
    return {
      threadRootId: node.parentId,
      replyToAuthor: node.author,
    };
  }
  return {
    threadRootId: node.id,
    replyToAuthor: null,
  };
}
