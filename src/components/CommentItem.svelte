<script lang="ts">
  import type { CommentTreeNode, VoteKind } from '../lib/db/types';
  import CommentItem from './CommentItem.svelte';

  interface Props {
    node: CommentTreeNode;
    /** 一级评论才展示楼中楼列表 */
    showReplies?: boolean;
    highlightId?: string | null;
    /** 父级记住哪些楼已展开，避免刷新后被重新折叠 */
    expanded?: boolean;
    onExpand?: (rootId: string) => void;
    onReply: (node: CommentTreeNode) => void;
    onDelete: (id: string) => void;
    onVote: (id: string, vote: VoteKind) => void;
  }

  let {
    node,
    showReplies = true,
    highlightId = null,
    expanded = false,
    onExpand,
    onReply,
    onDelete,
    onVote,
  }: Props = $props();

  let confirmDelete = $state(false);

  const COLLAPSE_AT = 3;

  const highlightInChildren = $derived(
    !!highlightId && node.children.some((child) => child.id === highlightId),
  );
  const isExpanded = $derived(expanded || highlightInChildren);

  const visibleChildren = $derived(
    showReplies && node.children.length > COLLAPSE_AT && !isExpanded
      ? node.children.slice(0, COLLAPSE_AT)
      : node.children,
  );
  const hiddenCount = $derived(
    showReplies && node.children.length > COLLAPSE_AT && !isExpanded
      ? node.children.length - COLLAPSE_AT
      : 0,
  );

  function formatRelativeTime(ts: number): string {
    const diff = Date.now() - ts;
    if (diff < 15_000) return '刚刚';
    if (diff < 60_000) return `${Math.floor(diff / 1000)} 秒前`;
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
    if (diff < 86_400_000 * 7) return `${Math.floor(diff / 86_400_000)} 天前`;

    const d = new Date(ts);
    const now = new Date();
    if (d.getFullYear() === now.getFullYear()) {
      return `${d.getMonth() + 1}-${d.getDate()}`;
    }
    return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  }

  const initial = $derived((node.author || '?').slice(0, 1).toUpperCase());
  const highlighted = $derived(highlightId === node.id);

  function requestDelete() {
    if (!confirmDelete) {
      confirmDelete = true;
      return;
    }
    confirmDelete = false;
    onDelete(node.id);
  }

  function cancelDelete() {
    confirmDelete = false;
  }

  function expandReplies() {
    onExpand?.(node.id);
  }

  const deleteLabel = $derived(
    showReplies && node.children.length > 0
      ? `确认删除（含 ${node.children.length} 条回复）`
      : '确认删除',
  );
</script>

<article class="item" class:reply={!showReplies} class:flash={highlighted} data-id={node.id}>
  <div class="row">
    <div class="avatar" aria-hidden="true">{initial}</div>
    <div class="main">
      <header>
        <strong>{node.author}</strong>
        <time datetime={new Date(node.createdAt).toISOString()}>{formatRelativeTime(node.createdAt)}</time>
      </header>
      <p class="body">
        {#if node.replyToAuthor}
          <span class="mention">@{node.replyToAuthor}</span>
        {/if}
        {node.body}
      </p>
      <footer>
        <button
          type="button"
          class="vote"
          class:active={node.myVote === 'up'}
          title="点赞"
          aria-pressed={node.myVote === 'up'}
          onclick={() => onVote(node.id, 'up')}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M7 22V10l5-7a2.5 2.5 0 0 1 4.6 1.6L15.8 10H20a2 2 0 0 1 1.9 2.6l-1.8 7A2 2 0 0 1 18.2 22H7Z"
            />
            <path d="M7 10v12H4a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1h3Z" />
          </svg>
          {#if node.likes > 0}
            <span>{node.likes}</span>
          {:else}
            <span>赞</span>
          {/if}
        </button>
        <button
          type="button"
          class="vote"
          class:active={node.myVote === 'down'}
          title="点踩"
          aria-pressed={node.myVote === 'down'}
          onclick={() => onVote(node.id, 'down')}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M17 2v12l-5 7a2.5 2.5 0 0 1-4.6-1.6L8.2 14H4a2 2 0 0 1-1.9-2.6l1.8-7A2 2 0 0 1 5.8 2H17Z"
            />
            <path d="M17 14V2h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-3Z" />
          </svg>
          {#if node.dislikes > 0}
            <span>{node.dislikes}</span>
          {:else}
            <span>踩</span>
          {/if}
        </button>
        <button type="button" onclick={() => onReply(node)}>回复</button>
        {#if confirmDelete}
          <button type="button" class="danger" onclick={requestDelete}>{deleteLabel}</button>
          <button type="button" onclick={cancelDelete}>取消</button>
        {:else}
          <button type="button" class="danger" onclick={requestDelete}>删除</button>
        {/if}
        {#if showReplies && node.children.length > 0}
          <span class="reply-count">{node.children.length} 条回复</span>
        {/if}
      </footer>
    </div>
  </div>

  {#if showReplies && node.children.length}
    <div class="children">
      {#each visibleChildren as child (child.id)}
        <CommentItem
          node={child}
          showReplies={false}
          {highlightId}
          {onReply}
          {onDelete}
          {onVote}
        />
      {/each}
      {#if hiddenCount > 0}
        <button type="button" class="more" onclick={expandReplies}>
          展开剩余 {hiddenCount} 条回复
        </button>
      {/if}
    </div>
  {/if}
</article>

<style>
  .item {
    padding: 12px 0;
    border-bottom: 1px solid var(--sc-line);
    border-radius: 6px;
    transition: background 1.2s ease;
  }

  .item:last-child {
    border-bottom: 0;
  }

  .item.reply {
    padding: 10px 0 0;
    border-bottom: 0;
  }

  .item.flash {
    background: var(--sc-accent-soft);
  }

  .row {
    display: flex;
    gap: 10px;
  }

  .avatar {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    flex-shrink: 0;
    display: grid;
    place-items: center;
    background: var(--sc-accent-soft);
    color: var(--sc-accent);
    font-size: 14px;
    font-weight: 600;
  }

  .reply .avatar {
    width: 24px;
    height: 24px;
    font-size: 11px;
  }

  .main {
    min-width: 0;
    flex: 1;
  }

  .children {
    margin: 8px 0 0 50px;
    padding: 4px 12px 8px;
    border-radius: 6px;
    background: var(--sc-surface);
  }

  header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 8px;
  }

  strong {
    color: var(--sc-muted);
    font-size: 13px;
    font-weight: 500;
  }

  time {
    color: var(--sc-faint);
    font-size: 12px;
    flex-shrink: 0;
  }

  .body {
    margin: 6px 0 4px;
    white-space: pre-wrap;
    word-break: break-word;
    font-size: 14px;
    line-height: 1.6;
    color: var(--sc-fg);
  }

  .mention {
    color: var(--sc-accent);
    font-weight: 500;
    margin-right: 4px;
  }

  footer {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 14px;
    margin-top: 2px;
  }

  .reply-count {
    margin-left: auto;
    font-size: 12px;
    color: var(--sc-faint);
  }

  button {
    border: 0;
    background: transparent;
    color: var(--sc-faint);
    cursor: pointer;
    font: inherit;
    font-size: 12px;
    padding: 0;
  }

  button:hover {
    color: var(--sc-accent);
  }

  button.danger:hover {
    color: var(--sc-danger);
  }

  .vote {
    display: inline-flex;
    align-items: center;
    gap: 3px;
  }

  .vote svg {
    width: 14px;
    height: 14px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.7;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .vote.active {
    color: var(--sc-accent);
  }

  .vote.active svg {
    fill: currentColor;
  }

  .more {
    margin-top: 6px;
    color: var(--sc-accent);
  }
</style>
