import type { VoteKind } from './types';

export interface VoteState {
  likes: number;
  dislikes: number;
  myVote: VoteKind | null;
}

/** 切换赞/踩：再点同侧取消，点另一侧切换 */
export function applyVote(state: VoteState, vote: VoteKind): VoteState {
  let { likes, dislikes, myVote } = state;
  likes = Math.max(0, likes);
  dislikes = Math.max(0, dislikes);

  if (myVote === vote) {
    if (vote === 'up') likes = Math.max(0, likes - 1);
    else dislikes = Math.max(0, dislikes - 1);
    return { likes, dislikes, myVote: null };
  }

  if (myVote === 'up') likes = Math.max(0, likes - 1);
  if (myVote === 'down') dislikes = Math.max(0, dislikes - 1);

  if (vote === 'up') likes += 1;
  else dislikes += 1;

  return { likes, dislikes, myVote: vote };
}
