<script lang="ts">
  import type { ReplyTarget } from '../lib/db/types';

  interface Props {
    target: ReplyTarget | null;
    disabled?: boolean;
    author: string;
    body?: string;
    expanded?: boolean;
    onSubmit: (body: string) => Promise<void> | void;
    onClearTarget: () => void;
    onAuthorChange: (name: string) => Promise<void> | void;
    onBodyChange?: (body: string) => void;
    onExpandedChange?: (expanded: boolean) => void;
  }

  let {
    target,
    disabled = false,
    author,
    body = $bindable(''),
    expanded = $bindable(false),
    onSubmit,
    onClearTarget,
    onAuthorChange,
    onBodyChange,
    onExpandedChange,
  }: Props = $props();

  let busy = $state(false);
  let error = $state('');
  let editingAuthor = $state(false);
  let draftAuthor = $state('');
  let textareaEl = $state<HTMLTextAreaElement | null>(null);

  const replyMode = $derived(!!target && target.kind !== 'video');

  function label(t: ReplyTarget | null): string {
    if (!t || t.kind === 'video') return '发条评论';
    if (t.replyToAuthor) return `回复 @${t.replyToAuthor}`;
    return '回复评论';
  }

  function setExpanded(value: boolean) {
    expanded = value;
    onExpandedChange?.(value);
  }

  function setBody(value: string) {
    body = value;
    onBodyChange?.(value);
  }

  function expand() {
    if (disabled) return;
    setExpanded(true);
    queueMicrotask(() => textareaEl?.focus());
  }

  function collapse() {
    setExpanded(false);
    editingAuthor = false;
    error = '';
  }

  $effect(() => {
    if (replyMode) {
      setExpanded(true);
      queueMicrotask(() => textareaEl?.focus());
    }
  });

  function startEditAuthor() {
    draftAuthor = author;
    editingAuthor = true;
  }

  async function commitAuthor() {
    editingAuthor = false;
    await onAuthorChange(draftAuthor);
  }

  function onAuthorKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      void commitAuthor();
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      editingAuthor = false;
    }
  }

  async function submit() {
    if (!body.trim() || busy || disabled) return;
    busy = true;
    error = '';
    try {
      await onSubmit(body.trim());
      setBody('');
      collapse();
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      busy = false;
    }
  }

  function onKeydown(e: KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      void submit();
      return;
    }
    if (e.key === 'Escape') {
      if (body.trim()) return;
      e.preventDefault();
      if (replyMode) onClearTarget();
      collapse();
    }
  }

  function cancelExpanded() {
    if (replyMode) onClearTarget();
    setBody('');
    collapse();
  }
</script>

<section class="composer">
  {#if !expanded}
    <button
      type="button"
      class="collapsed"
      disabled={disabled}
      onclick={expand}
      aria-expanded="false"
    >
      <span class="collapsed-author">{author}</span>
      <span class="collapsed-hint">
        {#if disabled}
          打开视频页后再评论
        {:else if body.trim()}
          未发送草稿：{body.trim()}
        {:else}
          {label(target)}…
        {/if}
      </span>
    </button>
  {:else}
    {#if replyMode}
      <div class="target">
        <div class="target-main">
          <span class="badge">{label(target)}</span>
        </div>
        <button type="button" class="clear" onclick={cancelExpanded}>取消</button>
      </div>
      {#if target?.preview}
        <p class="preview">「{target.preview}」</p>
      {/if}
    {/if}

    <div class="box">
      <div class="identity">
        {#if editingAuthor}
          <input
            class="author-input"
            maxlength="24"
            bind:value={draftAuthor}
            onkeydown={onAuthorKeydown}
            onblur={() => void commitAuthor()}
            aria-label="昵称"
          />
        {:else}
          <button type="button" class="author" onclick={startEditAuthor} title="改昵称">
            {author}
          </button>
        {/if}
      </div>
      <textarea
        bind:this={textareaEl}
        rows="2"
        placeholder={`${label(target)}…`}
        value={body}
        {disabled}
        oninput={(e) => setBody(e.currentTarget.value)}
        onkeydown={onKeydown}
      ></textarea>
      <div class="actions">
        {#if error}
          <span class="error">{error}</span>
        {:else}
          <span class="tip">Ctrl / ⌘ + Enter</span>
        {/if}
        {#if !replyMode}
          <button type="button" class="clear" onclick={cancelExpanded}>收起</button>
        {/if}
        <button
          type="button"
          class="send"
          disabled={disabled || busy || !body.trim()}
          onclick={() => void submit()}
        >
          {busy ? '发送中' : '发布'}
        </button>
      </div>
    </div>
  {/if}
</section>

<style>
  .composer {
    display: grid;
    gap: 6px;
    padding: 10px 14px 14px;
    border-top: 1px solid var(--sc-line);
    background: var(--sc-panel);
  }

  .collapsed {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    box-sizing: border-box;
    min-height: 36px;
    padding: 0 12px;
    border: 0;
    border-radius: 18px;
    background: var(--sc-surface);
    cursor: pointer;
    text-align: left;
    font: inherit;
  }

  .collapsed:hover:not(:disabled) {
    background: #e9eaec;
  }

  .collapsed:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  .collapsed-author {
    flex-shrink: 0;
    color: var(--sc-muted);
    font-size: 12px;
    font-weight: 500;
  }

  .collapsed-hint {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--sc-faint);
    font-size: 13px;
  }

  .target {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
  }

  .target-main {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }

  .badge {
    font-size: 12px;
    font-weight: 500;
    color: var(--sc-accent);
  }

  .clear {
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

  .preview {
    margin: 0;
    font-size: 12px;
    color: var(--sc-faint);
    line-height: 1.4;
    overflow: hidden;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
  }

  .box {
    display: grid;
    gap: 8px;
    padding: 10px 12px;
    border-radius: 6px;
    background: var(--sc-surface);
  }

  .identity {
    display: flex;
    align-items: center;
  }

  .author {
    border: 0;
    background: transparent;
    padding: 0;
    color: var(--sc-muted);
    font: inherit;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
  }

  .author:hover {
    color: var(--sc-accent);
  }

  .author-input {
    width: 8rem;
    border: 0;
    border-bottom: 1px solid var(--sc-accent);
    background: transparent;
    color: var(--sc-fg);
    font: inherit;
    font-size: 12px;
    outline: none;
    padding: 0 0 2px;
  }

  textarea {
    width: 100%;
    box-sizing: border-box;
    resize: none;
    min-height: 2.8rem;
    max-height: 7rem;
    border: 0;
    border-radius: 0;
    padding: 0;
    background: transparent;
    color: var(--sc-fg);
    font: inherit;
    font-size: 13px;
    line-height: 1.5;
    outline: none;
    field-sizing: content;
  }

  textarea:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    align-items: center;
    gap: 10px;
  }

  .tip {
    margin-right: auto;
    font-size: 11px;
    color: var(--sc-faint);
  }

  .error {
    color: var(--sc-danger);
    font-size: 12px;
    margin-right: auto;
  }

  .send {
    border: 0;
    border-radius: 4px;
    padding: 4px 14px;
    background: var(--sc-accent);
    color: #fff;
    cursor: pointer;
    font: inherit;
    font-size: 13px;
    font-weight: 500;
  }

  .send:hover:not(:disabled) {
    background: var(--sc-accent-hover);
  }

  .send:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
</style>
