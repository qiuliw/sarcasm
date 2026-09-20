<script lang="ts">
  import { onMount } from 'svelte';
  import {
    clearCustomAnchorPacks,
    clearNostrKeyApi,
    clearOutboxTrashApi,
    exportAnchorPacks,
    exportNostrKeyApi,
    generateNostrKeyApi,
    getEnabledBackends,
    getNostrSettings,
    importAnchorPacks,
    importNostrKeyApi,
    listAnchorPacks,
    listOutboxTrash,
    resetAllConfigApi,
    retryOutboxTrashApi,
    saveDisplayNameApi,
    saveNostrSettingsApi,
    setEnabledBackends,
  } from '../lib/messaging/api';
  import {
    DEFAULT_RELAYS,
    identityFromSettings,
    type NostrSettings,
  } from '../lib/nostr/settings';
  import type { AnchorPack } from '../lib/anchors/packs';
  import { availableBackends, type BackendId } from '../lib/backends/dispatch';
  import type { OutboxTrashItem } from '../lib/backends/outbox';

  interface Props {
    compact?: boolean;
    outboxPending?: number;
    outboxTrash?: number;
    onSaved?: () => void;
  }

  let {
    compact = false,
    outboxPending = 0,
    outboxTrash = 0,
    onSaved,
  }: Props = $props();

  let settings = $state<NostrSettings | null>(null);
  let nsecInput = $state('');
  let exportedNsec = $state('');
  let showExport = $state(false);
  let showImport = $state(false);
  let showSync = $state(false);
  let showTrash = $state(false);
  let trashItems = $state<OutboxTrashItem[]>([]);
  let confirmReset = $state(false);
  let rulesPanel = $state<'export' | 'import' | null>(null);
  let relayText = $state(DEFAULT_RELAYS.join('\n'));
  let status = $state('');
  let error = $state('');
  let busy = $state(false);
  let enabledBackends = $state<BackendId[]>(['nostr']);
  let packs = $state<AnchorPack[]>([]);
  let customCount = $state(0);
  let packJson = $state('');

  const identity = $derived(settings ? identityFromSettings(settings) : null);
  const backends = availableBackends();
  let displayNameDraft = $state('');

  async function refresh() {
    settings = await getNostrSettings();
    displayNameDraft = settings.displayName;
    relayText = settings.relays.join('\n');
    nsecInput = '';
    enabledBackends = await getEnabledBackends();
    const listed = await listAnchorPacks();
    packs = listed.all;
    customCount = listed.custom.length;
  }

  function parseRelays(text: string): string[] {
    return text
      .split(/\n|,/)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  function toggleBackend(id: BackendId, on: boolean) {
    if (on) enabledBackends = [...new Set([...enabledBackends, id])];
    else enabledBackends = enabledBackends.filter((x) => x !== id);
  }

  async function run(action: () => Promise<unknown>, okMessage = '已保存') {
    busy = true;
    error = '';
    status = '';
    try {
      await action();
      await refresh();
      status = okMessage;
      onSaved?.();
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      busy = false;
    }
  }

  async function exportKey() {
    busy = true;
    error = '';
    status = '';
    try {
      exportedNsec = await exportNostrKeyApi();
      showExport = true;
      showImport = false;
      status = '已导出';
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      busy = false;
    }
  }

  async function copyText(text: string, okMessage: string) {
    try {
      await navigator.clipboard.writeText(text);
      status = okMessage;
      error = '';
    } catch {
      error = '复制失败，请手动选中复制';
    }
  }

  async function exportRules() {
    busy = true;
    error = '';
    status = '';
    try {
      packJson = await exportAnchorPacks(true);
      rulesPanel = 'export';
      status = '已导出';
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      busy = false;
    }
  }

  function toggleRulesImport() {
    if (rulesPanel === 'import') {
      rulesPanel = null;
      packJson = '';
      return;
    }
    rulesPanel = 'import';
    packJson = '';
  }

  async function openTrash(e: MouseEvent) {
    e.stopPropagation();
    showSync = true;
    showTrash = !showTrash;
    if (showTrash) {
      try {
        trashItems = await listOutboxTrash();
      } catch (err) {
        error = err instanceof Error ? err.message : String(err);
      }
    }
  }

  function previewBody(body: string): string {
    const one = body.replace(/\s+/g, ' ').trim();
    return one.length > 48 ? `${one.slice(0, 48)}…` : one;
  }

  onMount(() => {
    void refresh().catch((e) => {
      error = e instanceof Error ? e.message : String(e);
    });
  });
</script>

<div class="settings" class:compact>
  {#if !compact}
    <header class="intro">
      <h1>设置</h1>
      <p>身份、同步与锚点规则。</p>
    </header>
  {/if}

  {#if error}
    <p class="banner err">{error}</p>
  {:else if status}
    <p class="banner ok">{status}</p>
  {/if}

  <section class="card">
    <h2>身份</h2>

    {#if identity?.configured}
      <div class="inline-row">
        <input
          type="text"
          maxlength="32"
          placeholder="显示名（可选）"
          bind:value={displayNameDraft}
        />
        <button
          type="button"
          class="save-sm"
          disabled={busy}
          onclick={() =>
            void run(async () => {
              await saveDisplayNameApi(displayNameDraft);
            }, '已保存')}
        >
          保存
        </button>
      </div>

      <div class="actions">
        <button
          type="button"
          class="ghost"
          disabled={busy}
          onclick={() => void exportKey()}
        >
          导出密钥
        </button>
        <button
          type="button"
          class="ghost"
          class:active={showImport}
          disabled={busy}
          onclick={() => {
            showImport = !showImport;
            showExport = false;
            if (!showImport) nsecInput = '';
          }}
        >
          更换
        </button>
        <button
          type="button"
          class="ghost"
          disabled={busy}
          onclick={() =>
            void run(async () => {
              exportedNsec = '';
              showExport = false;
              showImport = false;
              await clearNostrKeyApi();
            }, '已清除')}
        >
          清除
        </button>
      </div>
    {:else}
      <p class="hint">一把密钥对应一个显示名。</p>
      <div class="actions">
        <button
          type="button"
          disabled={busy}
          onclick={() =>
            void run(async () => {
              exportedNsec = '';
              showExport = false;
              showImport = false;
              await generateNostrKeyApi();
            }, '已生成')}
        >
          生成密钥
        </button>
        <button
          type="button"
          class="ghost"
          class:active={showImport}
          disabled={busy}
          onclick={() => {
            showImport = !showImport;
            if (!showImport) nsecInput = '';
          }}
        >
          导入密钥
        </button>
      </div>
    {/if}

    {#if showExport && exportedNsec}
      <label class="field">
        <span>nsec</span>
        <input type="text" readonly value={exportedNsec} />
      </label>
      <button type="button" class="ghost" disabled={busy} onclick={() => void copyText(exportedNsec, '已复制')}>
        复制
      </button>
    {/if}

    {#if showImport}
      <label class="field">
        <span>nsec</span>
        <input
          type="password"
          placeholder="nsec1…"
          bind:value={nsecInput}
          autocomplete="off"
        />
      </label>
      <button
        type="button"
        disabled={busy || !nsecInput.trim()}
        onclick={() =>
          void run(async () => {
            await importNostrKeyApi(nsecInput);
            nsecInput = '';
            exportedNsec = '';
            showExport = false;
            showImport = false;
          }, '已导入')}
      >
        确认导入
      </button>
    {/if}
  </section>

  <section class="card">
    <button
      type="button"
      class="card-toggle"
      onclick={() => (showSync = !showSync)}
      aria-expanded={showSync}
    >
      <h2>同步</h2>
      <span class="toggle-meta">
        {#if outboxPending > 0}
          <span class="pending">待同步 {outboxPending}</span>
        {/if}
        <span
          class="trash-btn"
          class:has-items={outboxTrash > 0}
          role="button"
          tabindex="0"
          title={outboxTrash > 0 ? `垃圾桶 ${outboxTrash}` : '垃圾桶'}
          aria-label={outboxTrash > 0 ? `垃圾桶 ${outboxTrash}` : '垃圾桶'}
          onclick={openTrash}
          onkeydown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              openTrash(e as unknown as MouseEvent);
            }
          }}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 7h16M9 7V5h6v2M8 7l1 12h6l1-12" />
          </svg>
          {#if outboxTrash > 0}
            <span class="trash-count">{outboxTrash > 99 ? '99+' : outboxTrash}</span>
          {/if}
        </span>
        <span class="chevron" class:open={showSync}>›</span>
      </span>
    </button>

    {#if showSync}
      {#if showTrash}
        <div class="trash-panel">
          <div class="trash-head">
            <span>永久失败</span>
            <div class="actions">
              <button
                type="button"
                class="ghost"
                disabled={busy || trashItems.length === 0}
                onclick={() =>
                  void run(async () => {
                    await retryOutboxTrashApi();
                    trashItems = await listOutboxTrash();
                  }, '已重新入队')}
              >
                全部重试
              </button>
              <button
                type="button"
                class="ghost danger"
                disabled={busy || trashItems.length === 0}
                onclick={() =>
                  void run(async () => {
                    await clearOutboxTrashApi();
                    trashItems = [];
                    showTrash = false;
                  }, '垃圾桶已清空')}
              >
                清空
              </button>
            </div>
          </div>
          {#if trashItems.length === 0}
            <p class="hint">暂无永久失败的消息</p>
          {:else}
            <ul class="trash-list">
              {#each trashItems as item (item.id)}
                <li>
                  <div class="trash-item">
                    <strong>{item.platform}/{item.videoId}</strong>
                    <span>{previewBody(item.body)}</span>
                    {#if item.lastError}
                      <span class="trash-err">{item.lastError}</span>
                    {/if}
                  </div>
                  <button
                    type="button"
                    class="ghost"
                    disabled={busy}
                    onclick={() =>
                      void run(async () => {
                        await retryOutboxTrashApi([item.id]);
                        trashItems = await listOutboxTrash();
                      }, '已重新入队')}
                  >
                    重试
                  </button>
                </li>
              {/each}
            </ul>
          {/if}
        </div>
      {/if}

      {#each backends as backend (backend.id)}
        <label class="check">
          <input
            type="checkbox"
            checked={enabledBackends.includes(backend.id)}
            onchange={(e) => toggleBackend(backend.id, e.currentTarget.checked)}
          />
          {backend.name}
        </label>
      {/each}

      {#if enabledBackends.includes('nostr')}
        <label class="field">
          <span>Relay</span>
          <textarea rows={compact ? 3 : 4} bind:value={relayText}></textarea>
        </label>
        <p class="hint">配 1 个需成功 1 个；配多个至少成功 2 个。</p>
        <label class="check">
          <input
            type="checkbox"
            checked={settings?.publishEnabled ?? true}
            onchange={(e) => {
              if (settings) settings.publishEnabled = e.currentTarget.checked;
            }}
          />
          发评同步
        </label>
        <label class="check">
          <input
            type="checkbox"
            checked={settings?.asyncPublish ?? true}
            onchange={(e) => {
              if (settings) settings.asyncPublish = e.currentTarget.checked;
            }}
          />
          后台异步（不阻塞发评，失败自动重试）
        </label>
      {/if}

      <button
        type="button"
        disabled={busy || !settings}
        onclick={() =>
          void run(async () => {
            if (!settings) return;
            await setEnabledBackends(enabledBackends);
            await saveNostrSettingsApi({
              ...settings,
              relays: parseRelays(relayText),
            });
          })}
      >
        保存
      </button>
    {/if}
  </section>

  <section class="card">
    <h2>锚点规则</h2>
    <ul class="pack-list">
      {#each packs as pack (pack.id)}
        <li>
          <strong>{pack.name}</strong>
          <code>{pack.id}</code>
        </li>
      {/each}
    </ul>
    <div class="actions">
      <button
        type="button"
        class="ghost"
        class:active={rulesPanel === 'export'}
        disabled={busy}
        onclick={() => void exportRules()}
      >
        导出
      </button>
      <button
        type="button"
        class="ghost"
        class:active={rulesPanel === 'import'}
        disabled={busy}
        onclick={toggleRulesImport}
      >
        导入
      </button>
      <button
        type="button"
        class="ghost"
        disabled={busy || customCount === 0}
        onclick={() =>
          void run(async () => {
            rulesPanel = null;
            packJson = '';
            await clearCustomAnchorPacks();
          }, '已重置')}
      >
        重置
      </button>
    </div>
    {#if rulesPanel === 'export'}
      <label class="field">
        <span>JSON</span>
        <textarea rows={compact ? 4 : 6} readonly value={packJson}></textarea>
      </label>
      <button
        type="button"
        class="ghost"
        disabled={busy || !packJson.trim()}
        onclick={() => void copyText(packJson, '已复制到剪贴板')}
      >
        复制
      </button>
    {:else if rulesPanel === 'import'}
      <label class="field">
        <span>JSON</span>
        <textarea
          rows={compact ? 4 : 6}
          bind:value={packJson}
          placeholder="粘贴规则 JSON"
        ></textarea>
      </label>
      <button
        type="button"
        disabled={busy || !packJson.trim()}
        onclick={() =>
          void run(async () => {
            await importAnchorPacks(packJson);
            packJson = '';
            rulesPanel = null;
          }, '已导入')}
      >
        确认导入
      </button>
    {/if}
  </section>

  <section class="card danger-card">
    <h2>重置</h2>
    {#if !confirmReset}
      <p class="hint">清除身份、同步、锚点与草稿，不删除本机评论。</p>
      <button
        type="button"
        class="ghost danger"
        disabled={busy}
        onclick={() => {
          confirmReset = true;
          status = '';
          error = '';
        }}
      >
        重置所有配置
      </button>
    {:else}
      <p class="hint warn">将清除密钥与自定义规则，此操作不可撤销。</p>
      <div class="actions">
        <button
          type="button"
          class="danger-fill"
          disabled={busy}
          onclick={() =>
            void run(async () => {
              await resetAllConfigApi();
              confirmReset = false;
              showImport = false;
              showSync = false;
              showExport = false;
              exportedNsec = '';
              nsecInput = '';
              rulesPanel = null;
              packJson = '';
            }, '配置已重置')}
        >
          确认重置
        </button>
        <button
          type="button"
          class="ghost"
          disabled={busy}
          onclick={() => {
            confirmReset = false;
          }}
        >
          取消
        </button>
      </div>
    {/if}
  </section>
</div>

<style>
  .settings {
    display: grid;
    gap: 12px;
  }

  .settings.compact {
    gap: 10px;
    padding-bottom: 8px;
  }

  .intro h1 {
    margin: 0;
    font-size: 20px;
  }

  .intro p {
    margin: 6px 0 0;
    color: var(--sc-muted, #61666d);
    font-size: 13px;
  }

  .card {
    display: grid;
    gap: 8px;
    padding: 12px;
    border-radius: 10px;
    background: var(--sc-surface, #f1f2f3);
    border: 1px solid var(--sc-line, #e3e5e7);
  }

  .settings:not(.compact) .card {
    background: #fff;
  }

  h2 {
    margin: 0;
    font-size: 13px;
    font-weight: 600;
    color: var(--sc-ink, #18191c);
  }

  .card-toggle {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    width: 100%;
    margin: 0;
    padding: 0;
    border: 0;
    background: transparent;
    color: inherit;
    font: inherit;
    cursor: pointer;
    text-align: left;
  }

  .toggle-meta {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
  }

  .chevron {
    display: inline-block;
    color: var(--sc-faint, #9499a0);
    font-size: 16px;
    line-height: 1;
    transform: rotate(90deg);
    transition: transform 140ms ease;
  }

  .chevron.open {
    transform: rotate(-90deg);
  }

  .hint {
    margin: 0;
    font-size: 12px;
    color: var(--sc-faint, #9499a0);
  }

  .pending {
    margin: 0;
    font-size: 12px;
    font-weight: 600;
    color: #e6a23c;
  }

  .trash-btn {
    position: relative;
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    border-radius: 8px;
    color: var(--sc-faint, #9499a0);
  }

  .trash-btn:hover,
  .trash-btn.has-items {
    color: #c4564e;
    background: #fff0f0;
  }

  .trash-btn svg {
    width: 15px;
    height: 15px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.8;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .trash-count {
    position: absolute;
    top: -2px;
    right: -2px;
    min-width: 14px;
    height: 14px;
    padding: 0 3px;
    border-radius: 999px;
    background: #f85a54;
    color: #fff;
    font-size: 9px;
    font-weight: 700;
    line-height: 14px;
    text-align: center;
  }

  .trash-panel {
    display: grid;
    gap: 8px;
    padding: 8px;
    border-radius: 8px;
    background: #fff;
    border: 1px solid #f0c4c0;
  }

  .trash-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    font-size: 12px;
    font-weight: 600;
    color: #c4564e;
  }

  .trash-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 8px;
  }

  .trash-list li {
    display: flex;
    align-items: flex-start;
    gap: 8px;
  }

  .trash-item {
    flex: 1;
    min-width: 0;
    display: grid;
    gap: 2px;
    font-size: 12px;
    color: var(--sc-muted, #61666d);
  }

  .trash-item strong {
    color: var(--sc-ink, #18191c);
    font-weight: 600;
  }

  .trash-err {
    color: #c4564e;
    word-break: break-all;
  }

  .field {
    display: grid;
    gap: 5px;
    font-size: 12px;
    color: var(--sc-muted, #61666d);
  }

  input[type='text'],
  input[type='password'],
  textarea {
    width: 100%;
    box-sizing: border-box;
    border: 1px solid var(--sc-line, #e3e5e7);
    border-radius: 8px;
    padding: 7px 9px;
    font: inherit;
    font-size: 13px;
    color: var(--sc-ink, #18191c);
    background: #fff;
  }

  textarea {
    resize: vertical;
    min-height: 72px;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  }

  .check {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    color: var(--sc-muted, #61666d);
  }

  .actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  .inline-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .inline-row input {
    flex: 1;
    min-width: 0;
  }

  .save-sm {
    flex-shrink: 0;
    padding: 7px 10px;
    font-size: 12px;
  }

  .pack-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 4px;
  }

  .pack-list li {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: baseline;
    font-size: 12px;
    color: var(--sc-muted, #61666d);
  }

  .pack-list code {
    font-size: 11px;
    color: var(--sc-accent, #fb7299);
  }

  button {
    border: 0;
    border-radius: 8px;
    padding: 7px 11px;
    background: var(--sc-accent, #fb7299);
    color: #fff;
    font: inherit;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
  }

  button.ghost {
    background: #fff;
    color: var(--sc-muted, #61666d);
    border: 1px solid var(--sc-line, #e3e5e7);
  }

  button.ghost.active {
    border-color: var(--sc-accent, #fb7299);
    color: var(--sc-accent, #fb7299);
  }

  button.ghost.danger {
    color: #c4564e;
    border-color: #f0c4c0;
  }

  button.danger-fill {
    background: #f85a54;
  }

  .danger-card {
    border-color: #f0c4c0;
  }

  .hint.warn {
    color: #c4564e;
  }

  button:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .banner {
    margin: 0;
    padding: 7px 9px;
    border-radius: 8px;
    font-size: 12px;
  }

  .banner.ok {
    background: #edf9f0;
    color: #2a7a3b;
  }

  .banner.err {
    background: #fff0f0;
    color: #f85a54;
  }
</style>
