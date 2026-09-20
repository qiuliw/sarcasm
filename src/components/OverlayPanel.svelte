<script lang="ts">
  import { onDestroy, onMount, tick } from 'svelte';
  import CommentItem from './CommentItem.svelte';
  import Composer from './Composer.svelte';
  import { createComment, deleteComment, listComments } from '../lib/messaging/api';
  import { buildCommentForest, resolveOverlayReply } from '../lib/db/tree';
  import type { CommentRecord, CommentTreeNode, PageContext, ReplyTarget } from '../lib/db/types';
  import { readPageContext, resolveAdapter } from '../lib/platforms';
  import { getDefaultAuthor, loadAuthor, saveAuthor } from '../lib/prefs/author';

  let open = $state(false);
  let context = $state<PageContext | null>(null);
  let rows = $state<CommentRecord[]>([]);
  let replyTarget = $state<ReplyTarget | null>({ kind: 'video' });
  let loading = $state(false);
  let status = $state('');
  let highlightId = $state<string | null>(null);
  let nativePreviews = $state<Record<string, string>>({});
  let scrollEl = $state<HTMLDivElement | null>(null);
  let author = $state(getDefaultAuthor());

  const forest = $derived(buildCommentForest(rows));
  const commentCount = $derived(rows.length);
  const hasComments = $derived(
    forest.videoRoots.length > 0 || Object.keys(forest.byNativeParent).length > 0,
  );
  const platformLabel = $derived(
    context?.platform === 'bilibili' ? 'B站' : context?.platform === 'douyin' ? '抖音' : '',
  );

  let stopNav: (() => void) | null = null;
  let scanTimer: number | undefined;
  let highlightTimer: number | undefined;
  const UI_OPEN_KEY = 'sarcasm_panel_open';
  const NATIVE_PREVIEW_KEY = 'sarcasm_native_previews';

  async function setOpen(value: boolean) {
    open = value;
    await browser.storage.local.set({ [UI_OPEN_KEY]: value });
  }

  function clearReplyTarget() {
    replyTarget = { kind: 'video' };
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key !== 'Escape' || !open) return;
    if (replyTarget && replyTarget.kind !== 'video') {
      clearReplyTarget();
      return;
    }
    void setOpen(false);
  }

  async function refreshContext() {
    const next = readPageContext();
    const switched =
      context?.platform !== next?.platform || context?.videoId !== next?.videoId;
    context = next;
    if (switched) {
      clearReplyTarget();
      highlightId = null;
    }
    if (!context) {
      rows = [];
      status = '当前页未识别到视频';
      return;
    }
    status = '';
    await reloadComments();
  }

  async function reloadComments() {
    if (!context) return;
    loading = true;
    try {
      rows = await listComments({
        platform: context.platform,
        videoId: context.videoId,
      });
    } catch (e) {
      status = e instanceof Error ? e.message : String(e);
    } finally {
      loading = false;
    }
  }

  async function flashAndScroll(id: string) {
    highlightId = id;
    if (highlightTimer) window.clearTimeout(highlightTimer);
    highlightTimer = window.setTimeout(() => {
      highlightId = null;
    }, 1600);
    await tick();
    const el = scrollEl?.querySelector(`[data-id="${CSS.escape(id)}"]`);
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  async function handleSubmit(body: string) {
    if (!context) throw new Error('没有视频上下文');
    const target = replyTarget ?? { kind: 'video' as const };

    const created = await createComment({
      platform: context.platform,
      videoId: context.videoId,
      body,
      author,
      parentId:
        target.kind === 'overlay_comment' ? target.threadRootId ?? target.targetId ?? null : null,
      nativeParentId: target.kind === 'native_comment' ? target.targetId ?? null : null,
      replyToAuthor: target.kind === 'overlay_comment' ? target.replyToAuthor ?? null : null,
    });

    clearReplyTarget();
    await reloadComments();
    await flashAndScroll(created.id);
  }

  function replyOverlay(node: CommentTreeNode) {
    const resolved = resolveOverlayReply(node);
    replyTarget = {
      kind: 'overlay_comment',
      targetId: node.id,
      threadRootId: resolved.threadRootId,
      replyToAuthor: resolved.replyToAuthor ?? undefined,
      preview: node.body.slice(0, 80),
    };
  }

  async function handleDelete(id: string) {
    await deleteComment(id);
    await reloadComments();
  }

  async function rememberNativePreview(id: string, preview: string) {
    const next = { ...nativePreviews, [id]: preview.slice(0, 60) };
    nativePreviews = next;
    await browser.storage.local.set({ [NATIVE_PREVIEW_KEY]: next });
  }

  function nativeSectionTitle(nativeId: string): string {
    const preview = nativePreviews[nativeId]?.trim();
    if (preview) return preview;
    return '原评论';
  }

  function anchorNative(id: string, preview: string) {
    replyTarget = {
      kind: 'native_comment',
      targetId: id,
      preview,
    };
    void rememberNativePreview(id, preview);
    void setOpen(true);
  }

  async function handleAuthorChange(name: string) {
    author = await saveAuthor(name);
  }

  function injectNativeButtons() {
    const adapter = resolveAdapter();
    if (!adapter) return;
    for (const hit of adapter.scanNativeComments(document)) {
      if (hit.element.querySelector('.sc-anchor-btn')) continue;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'sc-anchor-btn';
      btn.textContent = '外评';
      btn.title = '用外挂评论回复这条';
      btn.style.cssText =
        'margin-left:8px;font-size:12px;font-weight:500;border:0;background:transparent;color:#FB7299;padding:0 4px;cursor:pointer;';
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        anchorNative(hit.id, hit.preview);
      });
      hit.element.appendChild(btn);
    }
  }

  onMount(() => {
    void browser.storage.local.get([UI_OPEN_KEY, NATIVE_PREVIEW_KEY]).then((stored) => {
      open = stored[UI_OPEN_KEY] === true;
      const previews = stored[NATIVE_PREVIEW_KEY];
      if (previews && typeof previews === 'object') {
        nativePreviews = previews as Record<string, string>;
      }
    });
    void loadAuthor().then((name) => {
      author = name;
    });
    void refreshContext();
    window.addEventListener('keydown', handleKeydown);
    const adapter = resolveAdapter();
    stopNav =
      adapter?.observeNavigation(() => {
        void refreshContext();
      }) ?? null;

    scanTimer = window.setInterval(() => {
      injectNativeButtons();
    }, 1500);
  });

  onDestroy(() => {
    stopNav?.();
    if (scanTimer) window.clearInterval(scanTimer);
    if (highlightTimer) window.clearTimeout(highlightTimer);
    window.removeEventListener('keydown', handleKeydown);
  });
</script>

<div class="root" data-open={open}>
  {#if !open}
    <button
      type="button"
      class="fab"
      onclick={() => void setOpen(true)}
      title="打开外挂评论"
      aria-label="打开外挂评论"
      aria-expanded="false"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M5 5.75A2.75 2.75 0 0 1 7.75 3h8.5A2.75 2.75 0 0 1 19 5.75v6.5A2.75 2.75 0 0 1 16.25 15H11l-4.35 3.48A1 1 0 0 1 5 17.7V15.1a2.75 2.75 0 0 1-2-2.65v-6.7Z"
        />
      </svg>
      {#if commentCount > 0}
        <span class="fab-count">{commentCount > 99 ? '99+' : commentCount}</span>
      {/if}
    </button>
  {:else}
    <aside class="panel" class:panel-empty={!hasComments && !loading}>
      <header class="head">
        <div class="brand">
          <span class="brand-mark" aria-hidden="true">外</span>
          <div class="context">
            <div class="context-line">
              <strong class="title">外挂评论</strong>
              {#if commentCount > 0}
                <span class="count">{commentCount}</span>
              {/if}
            </div>
            {#if context}
              <span class="vid" title={context.title || context.videoId}>
                {platformLabel}
                {context.title || context.videoId}
              </span>
            {:else}
              <span class="vid">未识别当前视频</span>
            {/if}
          </div>
        </div>
        <div class="head-actions">
          <button
            type="button"
            class="icon-button"
            onclick={() => void refreshContext()}
            title="刷新"
            aria-label="刷新"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M20 11a8 8 0 1 0-2.34 5.66M20 5v6h-6" />
            </svg>
          </button>
          <button
            type="button"
            class="icon-button"
            onclick={() => void setOpen(false)}
            title="收起（Esc）"
            aria-label="收起"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </div>
      </header>

      {#if status}
        <p class="status">{status}</p>
      {/if}

      <div class="scroll" class:scroll-empty={!hasComments} bind:this={scrollEl}>
        {#if loading}
          <p class="empty">加载中…</p>
        {:else if !context}
          <p class="empty">打开具体视频页后再说</p>
        {:else if !hasComments}
          <p class="empty">还没有评论，来说两句吧</p>
        {:else}
          {#if forest.videoRoots.length}
            <section class="section">
              <h3>
                <span>视频下</span>
                <span class="sec-count">{forest.videoRoots.length}</span>
              </h3>
              <div class="list">
                {#each forest.videoRoots as node (node.id)}
                  <CommentItem
                    {node}
                    {highlightId}
                    onReply={replyOverlay}
                    onDelete={handleDelete}
                  />
                {/each}
              </div>
            </section>
          {/if}

          {#each Object.entries(forest.byNativeParent) as [nativeId, nodes] (nativeId)}
            <section class="section">
              <h3 title={nativeId}>
                <span>原评</span>
                <span class="native-preview">{nativeSectionTitle(nativeId)}</span>
              </h3>
              <div class="list">
                {#each nodes as node (node.id)}
                  <CommentItem
                    {node}
                    {highlightId}
                    onReply={replyOverlay}
                    onDelete={handleDelete}
                  />
                {/each}
              </div>
            </section>
          {/each}
        {/if}
      </div>

      <Composer
        target={replyTarget}
        disabled={!context}
        autofocus={open}
        {author}
        onSubmit={handleSubmit}
        onClearTarget={clearReplyTarget}
        onAuthorChange={handleAuthorChange}
      />
    </aside>
  {/if}
</div>

<style>
  :host,
  .root {
    /* B 站评论区色板 + Jobs_helper 悬浮卡片 */
    --sc-ink: #18191c;
    --sc-fg: #18191c;
    --sc-muted: #61666d;
    --sc-faint: #9499a0;
    --sc-line: #e3e5e7;
    --sc-surface: #f1f2f3;
    --sc-panel: #ffffff;
    --sc-card: #ffffff;
    --sc-accent: #fb7299;
    --sc-accent-hover: #e45a84;
    --sc-accent-soft: #fff0f3;
    --sc-warn: #e6a23c;
    --sc-warn-soft: #fff7e8;
    --sc-danger: #f85a54;
    --sc-shadow: 0 10px 25px rgb(251 114 153 / 15%), 0 2px 8px rgb(0 0 0 / 6%);
    --sc-radius: 16px;
    --sc-radius-sm: 8px;
    font-family:
      'PingFang SC',
      'Hiragino Sans GB',
      'Microsoft YaHei',
      'Segoe UI',
      system-ui,
      sans-serif;
    color: var(--sc-fg);
    line-height: 1.5;
  }

  .fab {
    position: fixed;
    right: 24px;
    bottom: 40px;
    z-index: 2147483646;
    width: 48px;
    height: 48px;
    display: grid;
    place-items: center;
    border: 0;
    border-radius: 50%;
    padding: 0;
    background: var(--sc-accent);
    color: #fff;
    box-shadow: 0 6px 16px rgb(251 114 153 / 40%);
    cursor: pointer;
    transition: transform 180ms ease, box-shadow 180ms ease;
  }

  .fab:hover {
    transform: scale(1.08);
    box-shadow: 0 8px 20px rgb(251 114 153 / 48%);
  }

  .fab svg {
    width: 22px;
    height: 22px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.8;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .fab-count {
    position: absolute;
    top: -4px;
    right: -4px;
    min-width: 18px;
    height: 18px;
    padding: 0 4px;
    box-sizing: border-box;
    border-radius: 999px;
    display: grid;
    place-items: center;
    background: #fff;
    color: var(--sc-accent);
    border: 1px solid var(--sc-accent-soft);
    font-size: 10px;
    font-weight: 700;
  }

  .panel {
    position: fixed;
    right: 24px;
    bottom: 40px;
    width: clamp(300px, 80vw, 400px);
    max-height: min(85vh, calc(100vh - 56px));
    height: auto;
    z-index: 2147483645;
    display: flex;
    flex-direction: column;
    border: 1px solid var(--sc-accent-soft);
    border-radius: var(--sc-radius);
    background: var(--sc-panel);
    box-shadow: var(--sc-shadow);
    overflow: hidden;
    transition: box-shadow 180ms ease;
  }

  .panel-empty {
    max-height: none;
  }

  .head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.65rem;
    padding: 14px 14px 12px;
    border-bottom: 1px solid var(--sc-accent-soft);
    cursor: default;
  }

  .brand {
    min-width: 0;
    flex: 1;
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .brand-mark {
    width: 40px;
    height: 40px;
    flex-shrink: 0;
    display: grid;
    place-items: center;
    border-radius: 10px;
    background: var(--sc-accent);
    color: #fff;
    font-size: 15px;
    font-weight: 700;
    box-shadow: 0 2px 8px rgb(251 114 153 / 30%);
  }

  .context {
    min-width: 0;
    flex: 1;
    display: grid;
    gap: 2px;
  }

  .context-line {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }

  .title {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 1.05rem;
    font-weight: 600;
    color: #2c3e50;
  }

  .count {
    flex-shrink: 0;
    font-size: 13px;
    font-weight: 500;
    color: var(--sc-faint);
    font-variant-numeric: tabular-nums;
  }

  .vid {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 12px;
    color: var(--sc-faint);
  }

  .head-actions {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;
  }

  .icon-button {
    width: 32px;
    height: 32px;
    display: grid;
    place-items: center;
    border: 0;
    background: var(--sc-accent-soft);
    border-radius: 50%;
    padding: 0;
    cursor: pointer;
    color: var(--sc-accent);
    transition: background 140ms ease, color 140ms ease, transform 140ms ease;
  }

  .icon-button:hover {
    background: var(--sc-accent);
    color: #fff;
    transform: scale(1.08);
  }

  .icon-button svg {
    width: 15px;
    height: 15px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.9;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .status {
    margin: 0;
    padding: 8px 16px 0;
    font-size: 12px;
    color: var(--sc-warn);
  }

  .scroll {
    flex: 1 1 auto;
    min-height: 0;
    max-height: min(58vh, 560px);
    overflow: auto;
    padding: 4px 16px 8px;
    background: var(--sc-panel);
  }

  .scroll-empty {
    max-height: none;
    flex: 0 0 auto;
    padding: 12px 16px 4px;
  }

  .section {
    padding-top: 8px;
  }

  .section + .section {
    margin-top: 4px;
    border-top: 1px solid var(--sc-line);
  }

  h3 {
    margin: 0 0 4px;
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    font-size: 13px;
    color: var(--sc-muted);
    font-weight: 500;
  }

  .native-preview {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 12px;
    font-weight: 400;
    color: var(--sc-accent);
    background: var(--sc-accent-soft);
    border-radius: 4px;
    padding: 1px 6px;
  }

  .sec-count {
    margin-left: auto;
    color: var(--sc-faint);
    font-variant-numeric: tabular-nums;
  }

  .list {
    display: block;
  }

  .empty {
    margin: 0;
    padding: 4px 0 8px;
    font-size: 13px;
    color: var(--sc-faint);
    text-align: left;
  }

  @media (prefers-reduced-motion: reduce) {
    .fab,
    .icon-button {
      transition: none;
    }

    .fab:hover,
    .icon-button:hover {
      transform: none;
    }
  }
</style>
