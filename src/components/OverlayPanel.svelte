<script lang="ts">
  import { onDestroy, onMount, tick } from 'svelte';
  import { fly, scale } from 'svelte/transition';
  import CommentItem from './CommentItem.svelte';
  import Composer from './Composer.svelte';
  import SettingsView from './SettingsView.svelte';
  import { createComment, deleteComment, getOutboxPending, listComments, syncComments, voteComment } from '../lib/messaging/api';
  import { buildCommentForest, resolveOverlayReply } from '../lib/db/tree';
  import type {
    CommentRecord,
    CommentTreeNode,
    PageContext,
    ReplyTarget,
    VoteKind,
  } from '../lib/db/types';
  import { observeHref, resolvePageContext } from '../lib/anchors/resolve';
  import { OUTBOX_KEY, OUTBOX_TRASH_KEY } from '../lib/backends/outbox';
  import { clearDraft, isMeaningfulDraft, loadDraft, saveDraft } from '../lib/prefs/draft';
  import {
    loadUiPrefs,
    UI_PREFS_KEY,
    type UiPrefs,
  } from '../lib/prefs/ui';
  import { loadNostrIdentity, type NostrIdentity } from '../lib/nostr/settings';

  let open = $state(false);
  let rootEl = $state<HTMLDivElement | null>(null);
  let panelEngaged = $state(false);
  let context = $state<PageContext | null>(null);
  let rows = $state<CommentRecord[]>([]);
  let replyTarget = $state<ReplyTarget>({ kind: 'video' });
  let composerBody = $state('');
  let loading = $state(false);
  let pulling = $state(false);
  let status = $state('');
  let highlightId = $state<string | null>(null);
  let scrollEl = $state<HTMLDivElement | null>(null);
  let identity = $state<NostrIdentity | null>(null);
  let expandedRoots = $state<Record<string, true>>({});
  let view = $state<'feed' | 'settings'>('feed');
  let outboxPending = $state(0);
  let outboxTrash = $state(0);
  let uiPrefs = $state<UiPrefs>({
    autoExpandOnComments: true,
    panelMaxVh: 85,
  });
  /** 用户在该视频上手动收起后，不再自动展开，直到换视频 */
  let collapsedForVideo = $state<string | null>(null);

  const forest = $derived(buildCommentForest(rows));
  const commentCount = $derived(rows.length);
  const hasComments = $derived(forest.videoRoots.length > 0);
  const inSettings = $derived(view === 'settings');
  const platformLabel = $derived(context?.platformName || context?.platform || '');

  let stopNav: (() => void) | null = null;
  let highlightTimer: number | undefined;
  let stopStorage: (() => void) | null = null;
  let stopKeyTrap: (() => void) | null = null;
  const UI_OPEN_KEY = 'sarcasm_panel_open';

  function contextKey(ctx: PageContext | null): string | null {
    return ctx ? `${ctx.platform}:${ctx.videoId}` : null;
  }

  async function setOpen(value: boolean, source: 'user' | 'auto' = 'user') {
    open = value;
    if (!value) {
      view = 'feed';
      if (source === 'user') {
        collapsedForVideo = contextKey(context);
      }
    } else if (source === 'user') {
      collapsedForVideo = null;
    }
    await browser.storage.local.set({ [UI_OPEN_KEY]: value });
  }

  /** 有评论展开、无评论收纳；用户手动收起后本视频不再自动展开 */
  async function syncPanelWithComments() {
    if (!uiPrefs.autoExpandOnComments || !context) return;

    if (commentCount === 0) {
      // 清空手动收起标记，便于下一条评论再自动展开
      if (collapsedForVideo === contextKey(context)) {
        collapsedForVideo = null;
      }
      // 正在使用面板时不收纳，避免打断输入/阅读
      if (open && view !== 'settings' && !isPanelEngaged()) {
        await setOpen(false, 'auto');
      }
      return;
    }

    if (!open && collapsedForVideo !== contextKey(context)) {
      await setOpen(true, 'auto');
    }
  }

  function isPanelEngaged(): boolean {
    if (!open) return false;
    if (panelEngaged) return true;
    if (!rootEl) return false;
    const rootNode = rootEl.getRootNode();
    const active =
      rootNode instanceof ShadowRoot
        ? rootNode.activeElement
        : document.activeElement;
    return !!active && rootEl.contains(active);
  }

  function clearReplyTarget() {
    replyTarget = { kind: 'video' };
  }

  async function persistDraftFor(ctx: PageContext) {
    await saveDraft(ctx.platform, ctx.videoId, {
      body: composerBody,
      replyTarget,
      expanded: false,
    });
  }

  async function restoreDraftFor(ctx: PageContext) {
    const draft = await loadDraft(ctx.platform, ctx.videoId);
    if (!draft || !isMeaningfulDraft(draft)) {
      composerBody = '';
      replyTarget = { kind: 'video' };
      return;
    }
    composerBody = draft.body;
    replyTarget = draft.replyTarget;
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key !== 'Escape' || !open) return;
    if (view === 'settings') {
      view = 'feed';
      return;
    }
    if (replyTarget.kind !== 'video') {
      clearReplyTarget();
      return;
    }
    void setOpen(false);
  }

  /** 面板内按键不冒泡到宿主页，避免抖音/B站快捷键 */
  function stopPanelKeyBubble(event: KeyboardEvent) {
    event.stopImmediatePropagation();
  }

  function isTypingTarget(node: EventTarget | null | undefined): boolean {
    return node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement;
  }

  /**
   * 抖音等站点常在 document/window 捕获阶段听快捷键。
   * 须在 window 捕获阶段用 stopImmediatePropagation 拦住，
   * 否则同级后续监听器仍会收到事件。
   * 不 preventDefault（除 Enter 发送），以免打字失效。
   */
  function trapPageShortcuts(event: KeyboardEvent) {
    if (!open) return;
    const path = event.composedPath();
    const root = path.find(
      (n): n is HTMLElement => n instanceof HTMLElement && n.classList.contains('root'),
    );
    if (!root) return;

    const shadow =
      root.getRootNode() instanceof ShadowRoot
        ? (root.getRootNode() as ShadowRoot)
        : null;
    const active = shadow?.activeElement ?? document.activeElement;
    const typing =
      path.some((n) => isTypingTarget(n)) || isTypingTarget(active);
    if (!typing) return;

    event.stopImmediatePropagation();

    if (event.type !== 'keydown') return;
    const input = path.find((n): n is HTMLInputElement => n instanceof HTMLInputElement);
    if (event.key === 'Enter' && input && input.closest('.composer')) {
      event.preventDefault();
      root.querySelector<HTMLButtonElement>('.composer button.send:not(:disabled)')?.click();
    }
  }

  function toggleSettings() {
    view = view === 'settings' ? 'feed' : 'settings';
  }

  async function refreshContext() {
    const next = await resolvePageContext(location.href);
    const switched =
      context?.platform !== next?.platform || context?.videoId !== next?.videoId;

    if (switched && context) {
      await persistDraftFor(context);
    }

    context = next;

    if (switched) {
      highlightId = null;
      expandedRoots = {};
      collapsedForVideo = null;
      rows = [];
      pulling = false;
      if (context) {
        await restoreDraftFor(context);
      } else {
        composerBody = '';
        replyTarget = { kind: 'video' };
      }
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
    const platform = context.platform;
    const videoId = context.videoId;
    loading = true;
    try {
      rows = await listComments({ platform, videoId });
      await syncPanelWithComments();
    } catch (e) {
      status = e instanceof Error ? e.message : String(e);
      loading = false;
      return;
    }
    loading = false;

    pulling = true;
    try {
      const synced = await syncComments({ platform, videoId });
      if (context?.platform !== platform || context?.videoId !== videoId) return;
      rows = synced.comments;
      if (synced.error) {
        console.warn('[sarcasm] pull comments', synced.error);
      }
      await syncPanelWithComments();
    } catch (e) {
      console.warn('[sarcasm] pull comments', e);
    } finally {
      if (context?.platform === platform && context?.videoId === videoId) {
        pulling = false;
      }
    }
  }

  async function flashAndScroll(id: string) {
    highlightId = id;
    if (highlightTimer) window.clearTimeout(highlightTimer);
    highlightTimer = window.setTimeout(() => {
      highlightId = null;
    }, 300);
    await tick();
    const el = scrollEl?.querySelector(`[data-id="${CSS.escape(id)}"]`);
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  async function handleSubmit(body: string) {
    if (!context) throw new Error('没有视频上下文');
    if (!identity?.configured) {
      throw new Error('请先在设置页配置 Nostr 密钥');
    }
    const target = replyTarget;

    const created = await createComment({
      platform: context.platform,
      videoId: context.videoId,
      body,
      author: identity.shortLabel,
      parentId:
        target.kind === 'overlay_comment' ? target.threadRootId ?? target.targetId ?? null : null,
      replyToAuthor: target.kind === 'overlay_comment' ? target.replyToAuthor ?? null : null,
      pageUrl: context.url,
    });

    if (target.kind === 'overlay_comment') {
      const rootId = target.threadRootId ?? target.targetId;
      if (rootId) {
        expandedRoots = { ...expandedRoots, [rootId]: true };
      }
    }

    clearReplyTarget();
    composerBody = '';
    await clearDraft(context.platform, context.videoId);
    rows = [...rows, created];
    await syncPanelWithComments();
    await flashAndScroll(created.id);
    void refreshOutbox();
  }

  function expandRoot(rootId: string) {
    expandedRoots = { ...expandedRoots, [rootId]: true };
  }

  function replyOverlay(node: CommentTreeNode) {
    const resolved = resolveOverlayReply(node);
    expandedRoots = { ...expandedRoots, [resolved.threadRootId]: true };
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

  async function handleVote(id: string, vote: VoteKind) {
    const updated = await voteComment(id, vote);
    rows = rows.map((row) => (row.id === id ? updated : row));
  }

  async function handleClearTarget() {
    clearReplyTarget();
    if (!composerBody.trim() && context) {
      await clearDraft(context.platform, context.videoId);
    }
  }

  async function refreshIdentity() {
    identity = await loadNostrIdentity();
  }

  async function refreshOutbox() {
    try {
      const { count, trash } = await getOutboxPending();
      outboxPending = count;
      outboxTrash = trash;
    } catch {
      // ignore
    }
  }

  onMount(() => {
    void browser.storage.local.get(UI_OPEN_KEY).then((stored) => {
      open = stored[UI_OPEN_KEY] === true;
    });
    void loadUiPrefs().then((prefs) => {
      uiPrefs = prefs;
    });
    void refreshIdentity();
    void refreshOutbox();
    void refreshContext();
    window.addEventListener('keydown', handleKeydown);
    window.addEventListener('keydown', trapPageShortcuts, true);
    window.addEventListener('keyup', trapPageShortcuts, true);
    window.addEventListener('keypress', trapPageShortcuts, true);
    stopKeyTrap = () => {
      window.removeEventListener('keydown', trapPageShortcuts, true);
      window.removeEventListener('keyup', trapPageShortcuts, true);
      window.removeEventListener('keypress', trapPageShortcuts, true);
    };
    const onStorage = (changes: Record<string, unknown>, area: string) => {
      if (area !== 'local') return;
      void refreshIdentity();
      if (OUTBOX_KEY in changes || OUTBOX_TRASH_KEY in changes) void refreshOutbox();
      if (UI_PREFS_KEY in changes) {
        void loadUiPrefs().then((prefs) => {
          uiPrefs = prefs;
          void syncPanelWithComments();
        });
      }
    };
    browser.storage.onChanged.addListener(onStorage);
    stopStorage = () => browser.storage.onChanged.removeListener(onStorage);
    stopNav = observeHref(() => {
      void refreshContext();
    });
  });

  onDestroy(() => {
    if (context) {
      void persistDraftFor(context);
    }
    stopNav?.();
    stopStorage?.();
    stopKeyTrap?.();
    if (highlightTimer) window.clearTimeout(highlightTimer);
    window.removeEventListener('keydown', handleKeydown);
  });
</script>

<div class="root" data-open={open} bind:this={rootEl}>
  {#if !open}
    <button
      type="button"
      class="fab"
      class:fab-muted={commentCount === 0}
      onclick={() => void setOpen(true)}
      title="打开评论"
      aria-label="打开评论"
      aria-expanded="false"
      transition:scale|local={{ duration: 220, start: 0.72, opacity: 0 }}
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
    <div
      class="panel"
      class:panel-empty={!hasComments && !loading && !inSettings}
      style:--sc-panel-max={uiPrefs.panelMaxVh}
      onkeydown={stopPanelKeyBubble}
      onkeyup={stopPanelKeyBubble}
      onkeypress={stopPanelKeyBubble}
      onpointerenter={() => {
        panelEngaged = true;
      }}
      onpointerleave={() => {
        panelEngaged = false;
      }}
      onfocusin={() => {
        panelEngaged = true;
      }}
      onfocusout={(event) => {
        const next = event.relatedTarget;
        if (next instanceof Node && rootEl?.contains(next)) return;
        panelEngaged = false;
      }}
      role="presentation"
      transition:fly|local={{ y: 18, duration: 260, opacity: 0 }}
    >
      <header class="head">
        <div class="context">
          {#if inSettings}
            <div class="context-line">
              <strong class="title">设置</strong>
            </div>
            <span class="vid">身份 · 同步</span>
          {:else if context}
            <div class="context-line">
              <strong class="title" title={context.videoId}>
                {context.videoId}
              </strong>
              {#if commentCount > 0}
                <span class="count">{commentCount}</span>
              {/if}
            </div>
            <span class="vid">{platformLabel}</span>
          {:else}
            <div class="context-line">
              <strong class="title">未识别视频</strong>
            </div>
          {/if}
        </div>
        <div class="head-actions">
          <button
            type="button"
            class="icon-button"
            class:active={inSettings}
            onclick={toggleSettings}
            title={inSettings ? '返回评论' : outboxPending > 0 ? `设置（待同步 ${outboxPending}）` : '设置'}
            aria-label={inSettings ? '返回评论' : '设置'}
          >
            {#if inSettings}
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M15 6 9 12l6 6" />
              </svg>
            {:else}
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"
                />
                <path
                  d="M19.4 13a7.8 7.8 0 0 0 .1-2l2-1.5-2-3.5-2.4 1a7.7 7.7 0 0 0-1.7-1L15 3h-4l-.4 2.5a7.7 7.7 0 0 0-1.7 1l-2.4-1-2 3.5 2 1.5a7.8 7.8 0 0 0 0 2l-2 1.5 2 3.5 2.4-1a7.7 7.7 0 0 0 1.7 1L11 21h4l.4-2.5a7.7 7.7 0 0 0 1.7-1l2.4 1 2-3.5-2-1.5Z"
                />
              </svg>
            {/if}
            {#if !inSettings && outboxPending > 0}
              <span class="gear-dot" aria-hidden="true"></span>
            {/if}
          </button>
          {#if !inSettings}
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
          {/if}
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

      {#if status && !inSettings}
        <p class="status">{status}</p>
      {/if}

      {#if inSettings}
        <div class="scroll settings-scroll">
          <SettingsView
            compact
            outboxPending={outboxPending}
            outboxTrash={outboxTrash}
            onSaved={() => {
              void refreshIdentity();
              void refreshOutbox();
              void refreshContext();
            }}
          />
        </div>
      {:else}
        <div class="scroll" class:scroll-empty={!hasComments && !pulling} bind:this={scrollEl}>
          {#if pulling}
            <div class="pull-hint" aria-live="polite">同步中…</div>
          {/if}
          {#if !context}
            <p class="empty">打开具体视频页后再说</p>
          {:else if !identity?.configured}
            <p class="empty">点右上角齿轮配置 Nostr 密钥后再发评。</p>
          {:else if !hasComments}
            <p class="empty">{loading ? '加载中…' : '还没有评论，来说两句吧'}</p>
          {:else}
            <section class="section">
              <div class="list">
                {#each forest.videoRoots as node (node.id)}
                  <CommentItem
                    {node}
                    {highlightId}
                    expanded={!!expandedRoots[node.id]}
                    onExpand={expandRoot}
                    onReply={replyOverlay}
                    onDelete={handleDelete}
                    onVote={handleVote}
                  />
                {/each}
              </div>
            </section>
          {/if}
        </div>

        <Composer
          bind:body={composerBody}
          target={replyTarget}
          disabled={!context || !identity?.configured}
          onSubmit={handleSubmit}
          onClearTarget={() => void handleClearTarget()}
        />
      {/if}
    </div>
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
    transition:
      transform 180ms ease,
      box-shadow 180ms ease,
      background 180ms ease,
      color 180ms ease;
  }

  .fab.fab-muted {
    background: #c8c9cc;
    color: #fff;
    box-shadow: 0 4px 12px rgb(0 0 0 / 10%);
  }

  .fab:hover {
    transform: scale(1.08);
    box-shadow: 0 8px 20px rgb(251 114 153 / 48%);
  }

  .fab.fab-muted:hover {
    background: #b0b1b5;
    box-shadow: 0 6px 14px rgb(0 0 0 / 12%);
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

  .gear-dot {
    position: absolute;
    top: 4px;
    right: 4px;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #e6a23c;
    border: 1.5px solid #fff;
  }

  .panel {
    position: fixed;
    right: 24px;
    bottom: 40px;
    width: clamp(300px, 80vw, 400px);
    max-height: min(calc(var(--sc-panel-max, 85) * 1vh), calc(100vh - 56px));
    height: auto;
    z-index: 2147483645;
    display: flex;
    flex-direction: column;
    border: 1px solid var(--sc-accent-soft);
    border-radius: var(--sc-radius);
    background: var(--sc-panel);
    box-shadow: var(--sc-shadow);
    overflow: hidden;
    transform-origin: bottom right;
    transition:
      box-shadow 180ms ease,
      max-height 180ms ease;
  }

  @media (max-height: 720px) {
    .panel {
      bottom: 16px;
      right: 12px;
      max-height: min(calc(var(--sc-panel-max, 85) * 1vh), calc(100vh - 24px));
    }

    .fab {
      bottom: 16px;
      right: 12px;
    }
  }

  .panel-empty {
    max-height: none;
  }

  .head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.65rem;
    padding: 10px 12px 8px;
    border-bottom: 1px solid var(--sc-accent-soft);
    cursor: default;
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
    font-size: 0.95rem;
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
    position: relative;
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

  .icon-button.active {
    background: var(--sc-accent);
    color: #fff;
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

  .settings-scroll {
    max-height: none;
    flex: 1 1 auto;
    min-height: 0;
    overflow: auto;
  }

  .status {
    margin: 0;
    padding: 8px 16px 0;
    font-size: 12px;
    color: var(--sc-warn);
  }

  .pull-hint {
    margin: 0 0 2px;
    padding: 2px 0 0;
    color: var(--sc-accent);
    font-size: 11px;
    text-align: center;
  }

  .scroll {
    flex: 1 1 auto;
    min-height: 0;
    max-height: none;
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
    padding-top: 4px;
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
    .panel,
    .icon-button {
      transition: none;
    }

    .fab:hover,
    .icon-button:hover {
      transform: none;
    }
  }
</style>
