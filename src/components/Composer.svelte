<script lang="ts">
  import type { ReplyTarget } from '../lib/db/types';

  interface Props {
    target: ReplyTarget | null;
    disabled?: boolean;
    author: string;
    body?: string;
    onSubmit: (body: string) => Promise<void> | void;
    onClearTarget: () => void;
  }

  let {
    target,
    disabled = false,
    author,
    body = $bindable(''),
    onSubmit,
    onClearTarget,
  }: Props = $props();

  let busy = $state(false);
  let error = $state('');
  let inputEl = $state<HTMLInputElement | null>(null);

  const replyMode = $derived(!!target && target.kind !== 'video');

  function label(t: ReplyTarget | null): string {
    if (!t || t.kind === 'video') return '善语结善缘，恶言伤人心';
    if (t.replyToAuthor) return `回复 @${t.replyToAuthor}`;
    return '回复评论';
  }

  $effect(() => {
    if (replyMode) {
      queueMicrotask(() => inputEl?.focus());
    }
  });

  async function submit() {
    if (!body.trim() || busy || disabled) return;
    busy = true;
    error = '';
    try {
      await onSubmit(body.trim());
      body = '';
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      busy = false;
      queueMicrotask(() => inputEl?.focus());
    }
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      void submit();
      return;
    }
    if (e.key === 'Escape') {
      if (body.trim()) return;
      e.preventDefault();
      if (replyMode) onClearTarget();
    }
  }

  function cancelReply() {
    onClearTarget();
    body = '';
  }
</script>

<section class="composer">
  {#if replyMode}
    <div class="target">
      <span class="badge">{label(target)}</span>
      {#if target?.preview}
        <span class="preview">「{target.preview}」</span>
      {/if}
      <button type="button" class="clear" onclick={cancelReply}>取消</button>
    </div>
  {/if}

  <div class="row">
    <span class="author" title={author}>{author}</span>
    <input
      bind:this={inputEl}
      class="line"
      type="text"
      maxlength="500"
      placeholder={disabled ? '打开视频页后再评论' : label(target)}
      value={body}
      {disabled}
      oninput={(e) => (body = e.currentTarget.value)}
      onkeydown={onKeydown}
    />
    <button
      type="button"
      class="send"
      disabled={disabled || busy || !body.trim()}
      onclick={() => void submit()}
    >
      {busy ? '…' : '发送'}
    </button>
  </div>

  {#if error}
    <p class="error">{error}</p>
  {/if}
</section>

<style>
  .composer {
    display: grid;
    gap: 6px;
    padding: 8px 12px 10px;
    border-top: 1px solid var(--sc-line);
    background: var(--sc-panel);
  }

  .target {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }

  .badge {
    flex-shrink: 0;
    font-size: 12px;
    font-weight: 500;
    color: var(--sc-accent);
  }

  .preview {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 12px;
    color: var(--sc-faint);
  }

  .clear {
    margin-left: auto;
    border: 0;
    background: transparent;
    color: var(--sc-faint);
    cursor: pointer;
    font: inherit;
    font-size: 12px;
    flex-shrink: 0;
  }

  .clear:hover {
    color: var(--sc-accent);
  }

  .row {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 36px;
    padding: 0 4px 0 10px;
    border-radius: 18px;
    background: var(--sc-surface);
  }

  .author {
    flex-shrink: 0;
    max-width: 4.8rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--sc-muted);
    font-size: 12px;
    font-weight: 500;
  }

  .line {
    flex: 1;
    min-width: 0;
    border: 0;
    background: transparent;
    color: var(--sc-fg);
    font: inherit;
    font-size: 13px;
    line-height: 1.4;
    outline: none;
    padding: 8px 0;
  }

  .line:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  .send {
    flex-shrink: 0;
    border: 0;
    border-radius: 14px;
    padding: 5px 12px;
    background: transparent;
    color: var(--sc-accent);
    cursor: pointer;
    font: inherit;
    font-size: 13px;
    font-weight: 600;
  }

  .send:hover:not(:disabled) {
    color: var(--sc-accent-hover);
  }

  .send:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }

  .error {
    margin: 0;
    font-size: 12px;
    color: var(--sc-danger);
  }
</style>
