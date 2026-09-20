<script lang="ts">
  import type { CommentTreeNode } from '../lib/db/types';
  import CommentItem from './CommentItem.svelte';

  interface Props {
    node: CommentTreeNode;
    /** 一级评论才展示楼中楼列表 */
    showReplies?: boolean;
    onReply: (node: CommentTreeNode) => void;
    onDelete: (id: string) => void;
  }

  let { node, showReplies = true, onReply, onDelete }: Props = $props();

  function formatTime(ts: number): string {
    const d = new Date(ts);
    const now = new Date();
    const sameDay =
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate();
    if (sameDay) {
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    const sameYear = d.getFullYear() === now.getFullYear();
    if (sameYear) {
      return `${d.getMonth() + 1}-${d.getDate()}`;
    }
    return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  }

  const initial = $derived((node.author || '?').slice(0, 1).toUpperCase());
</script>

<article class="item" class:reply={!showReplies}>
  <div class="row">
    <div class="avatar" aria-hidden="true">{initial}</div>
    <div class="main">
      <header>
        <strong>{node.author}</strong>
        <time datetime={new Date(node.createdAt).toISOString()}>{formatTime(node.createdAt)}</time>
      </header>
      <p class="body">
        {#if node.replyToAuthor}
          <span class="mention">@{node.replyToAuthor}</span>
        {/if}
        {node.body}
      </p>
      <footer>
        <button type="button" onclick={() => onReply(node)}>回复</button>
        <button type="button" class="danger" onclick={() => onDelete(node.id)}>删除</button>
      </footer>
    </div>
  </div>

  {#if showReplies && node.children.length}
    <div class="children">
      {#each node.children as child (child.id)}
        <CommentItem node={child} showReplies={false} {onReply} {onDelete} />
      {/each}
    </div>
  {/if}
</article>

<style>
  .item {
    padding: 12px 0;
    border-bottom: 1px solid var(--sc-line);
  }

  .item:last-child {
    border-bottom: 0;
  }

  .item.reply {
    padding: 10px 0 0;
    border-bottom: 0;
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
    gap: 16px;
    margin-top: 2px;
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
</style>
