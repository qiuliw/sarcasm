<script lang="ts">
  import type { ReplyTarget } from '../lib/db/types';

  interface Props {
    target: ReplyTarget | null;
    disabled?: boolean;
    autofocus?: boolean;
    onSubmit: (body: string) => Promise<void> | void;
    onClearTarget: () => void;
  }

  let {
    target,
    disabled = false,
    autofocus = false,
    onSubmit,
    onClearTarget,
  }: Props = $props();

  let body = $state('');
  let busy = $state(false);
  let error = $state('');
  let textareaEl = $state<HTMLTextAreaElement | null>(null);

  function label(t: ReplyTarget | null): string {
    if (!t || t.kind === 'video') return '发条评论';
    if (t.kind === 'native_comment') return '回复原评论';
    if (t.replyToAuthor) return `回复 @${t.replyToAuthor}`;
    return '回复评论';
  }

  $effect(() => {
    // 打开面板或切换回复目标时，把光标放进输入框
    if (autofocus && !disabled) {
      queueMicrotask(() => textareaEl?.focus());
    }
  });

  $effect(() => {
    // 仅依赖 target 变化以触发聚焦
    void target?.kind;
    void target?.targetId;
    if (!disabled && target && target.kind !== 'video') {
      queueMicrotask(() => textareaEl?.focus());
    }
  });

  async function submit() {
    if (!body.trim() || busy || disabled) return;
    busy = true;
    error = '';
    try {
      await onSubmit(body.trim());
      body = '';
      queueMicrotask(() => textareaEl?.focus());
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
    }
  }
</script>

<section class="composer">
  {#if target && target.kind !== 'video'}
    <div class="target">
      <div class="target-main">
        <span class="badge">{label(target)}</span>
      </div>
      <button type="button" class="clear" onclick={onClearTarget}>取消</button>
    </div>
    {#if target.preview}
      <p class="preview">「{target.preview}」</p>
    {/if}
  {/if}

  <div class="box">
    <textarea
      bind:this={textareaEl}
      rows="2"
      placeholder={disabled ? '打开视频页后再评论' : `${label(target)}…`}
      bind:value={body}
      {disabled}
      onkeydown={onKeydown}
    ></textarea>
    <div class="actions">
      {#if error}
        <span class="error">{error}</span>
      {:else}
        <span class="tip">Ctrl / ⌘ + Enter</span>
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
</section>

<style>
  .composer {
    display: grid;
    gap: 6px;
    padding: 10px 14px 14px;
    border-top: 1px solid var(--sc-line);
    background: var(--sc-panel);
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
