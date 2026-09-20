import type {
  CommentRecord,
  CreateCommentInput,
  ListCommentsQuery,
  PageContext,
  ReplyTarget,
  VoteCommentInput,
  VoteKind,
} from '../db/types';

export type BgRequest =
  | { type: 'ping' }
  | { type: 'list_comments'; query: ListCommentsQuery }
  | { type: 'create_comment'; input: CreateCommentInput }
  | { type: 'delete_comment'; id: string }
  | { type: 'vote_comment'; input: VoteCommentInput }
  | { type: 'stats' };

export type BgResponse =
  | { ok: true; data?: unknown }
  | { ok: false; error: string };

export type ContentEvent =
  | { type: 'page_context'; context: PageContext | null }
  | { type: 'set_reply_target'; target: ReplyTarget | null };

export async function sendBg<T = unknown>(request: BgRequest): Promise<T> {
  const res = (await browser.runtime.sendMessage(request)) as BgResponse;
  if (!res?.ok) {
    throw new Error(res?.error || '后台请求失败');
  }
  return res.data as T;
}

export function listComments(query: ListCommentsQuery): Promise<CommentRecord[]> {
  return sendBg({ type: 'list_comments', query });
}

export function createComment(input: CreateCommentInput): Promise<CommentRecord> {
  return sendBg({ type: 'create_comment', input });
}

export function deleteComment(id: string): Promise<void> {
  return sendBg({ type: 'delete_comment', id });
}

export function voteComment(id: string, vote: VoteKind): Promise<CommentRecord> {
  return sendBg({ type: 'vote_comment', input: { id, vote } });
}

export function getStats(): Promise<{ count: number }> {
  return sendBg({ type: 'stats' });
}
