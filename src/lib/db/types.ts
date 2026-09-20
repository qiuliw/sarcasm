export type AnchorRuleId = string;

/** 本地点赞状态：赞 / 踩 / 未表态 */
export type VoteKind = 'up' | 'down';

/** 回复锚点：视频本体 / 外挂评论 */
export type ReplyAnchorKind = 'video' | 'overlay_comment';

export interface CommentRecord {
  id: string;
  platform: AnchorRuleId;
  videoId: string;
  /** 仅指向一级评论；二级全部挂在同一 parent 下 */
  parentId: string | null;
  /** 历史字段：曾用于锚定平台原生评论，新评论不再写入 */
  nativeParentId: string | null;
  /** 回复对象显示名快照 */
  replyToAuthor: string | null;
  /** 回复对象 Nostr 公钥 */
  replyToPubkey: string | null;
  author: string;
  /** Nostr 事件作者的 32-byte hex 公钥；旧本地评论可能为空 */
  authorPubkey: string | null;
  body: string;
  likes: number;
  dislikes: number;
  /** 当前浏览器用户的投票 */
  myVote: VoteKind | null;
  createdAt: number;
  updatedAt: number;
}

export interface CommentTreeNode extends CommentRecord {
  /** 仅一层子回复（不再嵌套） */
  children: CommentTreeNode[];
}

export interface PageContext {
  platform: AnchorRuleId;
  platformName?: string;
  videoId: string;
  url: string;
}

export interface ReplyTarget {
  kind: ReplyAnchorKind;
  /** overlay 评论 id */
  targetId?: string;
  /** 外挂楼：一级评论 id（回复二级时仍指向一级） */
  threadRootId?: string;
  /** 被回复者显示名 */
  replyToAuthor?: string;
  /** 被回复者 Nostr 公钥 */
  replyToPubkey?: string;
  /** 展示用摘要 */
  preview?: string;
}

export interface CreateCommentInput {
  platform: AnchorRuleId;
  videoId: string;
  body: string;
  author?: string;
  authorPubkey?: string | null;
  parentId?: string | null;
  replyToAuthor?: string | null;
  replyToPubkey?: string | null;
  pageUrl?: string;
}

export interface ListCommentsQuery {
  platform: AnchorRuleId;
  videoId: string;
}

export interface VoteCommentInput {
  id: string;
  vote: VoteKind;
}
