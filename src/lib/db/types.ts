export type Platform = 'bilibili' | 'douyin';

/** 本地点赞状态：赞 / 踩 / 未表态 */
export type VoteKind = 'up' | 'down';

/** 回复锚点：视频本体 / 平台原生评论 / 外挂评论 */
export type AnchorKind = 'video' | 'native_comment' | 'overlay_comment';

export interface CommentRecord {
  id: string;
  platform: Platform;
  videoId: string;
  /** 仅指向一级评论；二级全部挂在同一 parent 下 */
  parentId: string | null;
  /** 回复平台原生评论时记录其评论 id */
  nativeParentId: string | null;
  /** 二级回复对象用户名，展示为 @用户名 */
  replyToAuthor: string | null;
  author: string;
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
  platform: Platform;
  videoId: string;
  title?: string;
  url: string;
}

export interface ReplyTarget {
  kind: AnchorKind;
  /** native 评论 id 或 overlay 评论 id */
  targetId?: string;
  /** 外挂楼：一级评论 id（回复二级时仍指向一级） */
  threadRootId?: string;
  /** 外挂楼：被回复者用户名 */
  replyToAuthor?: string;
  /** 展示用摘要 */
  preview?: string;
}

export interface CreateCommentInput {
  platform: Platform;
  videoId: string;
  body: string;
  author?: string;
  parentId?: string | null;
  nativeParentId?: string | null;
  replyToAuthor?: string | null;
}

export interface ListCommentsQuery {
  platform: Platform;
  videoId: string;
}

export interface VoteCommentInput {
  id: string;
  vote: VoteKind;
}
