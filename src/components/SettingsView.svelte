<script lang="ts">
  import { onMount } from 'svelte';
  import {
    clearCommentsCacheApi,
    clearNostrKeyApi,
    clearOutboxTrashApi,
    exportNostrKeyApi,
    generateNostrKeyApi,
    getNostrSettings,
    getStats,
    importNostrKeyApi,
    listOutboxTrash,
    probeNostrRelaysApi,
    resetAllConfigApi,
    retryOutboxTrashApi,
    saveDisplayNameApi,
    saveNostrSettingsApi,
  } from '../lib/messaging/api';
  import type { RelayProbeResult } from '../lib/nostr/probe';
  import {
    DEFAULT_RELAYS,
    identityFromSettings,
    type NostrSettings,
  } from '../lib/nostr/settings';
  import { adapterLabel, listPlatformAdapters } from '../lib/platforms';
  import type { OutboxTrashItem } from '../lib/backends/outbox';
  import {
    clampPanelMaxVh,
    loadUiPrefs,
    PANEL_MAX_VH_MAX,
    PANEL_MAX_VH_MIN,
    PANEL_MAX_VH_STEP,
    saveUiPrefs,
    type UiPrefs,
  } from '../lib/prefs/ui';

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
  let uiPrefs = $state<UiPrefs>({
    autoExpandOnComments: true,
    panelMaxVh: 85,
  });
  let nsecInput = $state('');
  let exportedNsec = $state('');
  let showExport = $state(false);
  let showImport = $state(false);
  let showSync = $state(false);
  let showPlatforms = $state(false);
  let showTrash = $state(false);
  let trashItems = $state<OutboxTrashItem[]>([]);
  let confirmReset = $state(false);
  let confirmClearCache = $state(false);
  let cacheCount = $state<number | null>(null);
  let cacheBytes = $state<number | null>(null);
  let relayDrafts = $state(
    DEFAULT_RELAYS.map((url) => ({ id: crypto.randomUUID(), url })),
  );
  let relayResults = $state<Record<string, RelayProbeResult>>({});
  let testingRelays = $state<Record<string, true>>({});
  let status = $state('');
  let error = $state('');
  let busy = $state(false);
  let displayNameDraft = $state('');

  const identity = $derived(settings ? identityFromSettings(settings) : null);
  const platforms = listPlatformAdapters();
  const relayList = $derived(
    [...new Set(relayDrafts.map((relay) => relay.url.trim()).filter(Boolean))],
  );
  const relayDirty = $derived(
    !!settings && settings.relays.join('\n') !== relayList.join('\n'),
  );
  const displayNameDirty = $derived(
    !!settings &&
      !!identity?.configured &&
      displayNameDraft.trim().slice(0, 32) !== settings.displayName,
  );

  async function refresh() {
    settings = await getNostrSettings();
    uiPrefs = await loadUiPrefs();
    displayNameDraft = settings.displayName;
    relayDrafts = settings.relays.map((url) => ({
      id: crypto.randomUUID(),
      url,
    }));
    nsecInput = '';
    try {
      const stats = await getStats();
      cacheCount = stats.count;
      cacheBytes = stats.bytes;
    } catch {
      cacheCount = null;
      cacheBytes = null;
    }
  }

  function formatBytes(n: number): string {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10 * 1024 ? 1 : 0)} KB`;
    return `${(n / (1024 * 1024)).toFixed(2)} MB`;
  }

  const cacheSizeLabel = $derived(
    cacheCount === null || cacheBytes === null
      ? '…'
      : `${cacheCount} 条 · ${formatBytes(cacheBytes)}`,
  );

  function addRelay() {
    relayDrafts = [
      ...relayDrafts,
      { id: crypto.randomUUID(), url: 'wss://' },
    ];
  }

  function removeRelay(id: string) {
    relayDrafts = relayDrafts.filter((relay) => relay.id !== id);
  }

  async function testRelayUrls(urls: string[]) {
    const unique = [...new Set(urls)];
    if (!unique.length) return;
    testingRelays = {
      ...testingRelays,
      ...Object.fromEntries(unique.map((url) => [url, true as const])),
    };
    error = '';
    try {
      const results = await probeNostrRelaysApi(unique);
      relayResults = {
        ...relayResults,
        ...Object.fromEntries(results.map((result) => [result.url, result])),
      };
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      const next = { ...testingRelays };
      for (const url of unique) delete next[url];
      testingRelays = next;
    }
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
      <p>身份与同步。</p>
    </header>
  {/if}

  {#if error}
    <p class="banner err">{error}</p>
  {:else if status}
    <p class="banner ok">{status}</p>
  {/if}

  <section class="card">
    <h2 class="section-heading">
      身份
      {#if displayNameDirty}
        <span class="save-state">未保存</span>
      {/if}
    </h2>

    {#if identity?.configured}
      <div class="inline-row">
        <input
          type="text"
          maxlength="32"
          placeholder="显示名（可选）"
          bind:value={displayNameDraft}
        />
      </div>

      <div class="actions identity-actions">
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
        <button
          type="button"
          class="identity-save"
          disabled={busy || !displayNameDirty}
          onclick={() =>
            void run(async () => {
              await saveDisplayNameApi(displayNameDraft);
            }, '已保存')}
        >
          保存
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
    <h2>面板</h2>
    <div class="pref-row">
      <span class="pref-label">有评论时自动开关</span>
      <div class="capsule" role="group" aria-label="有评论时自动开关">
        <button
          type="button"
          class="capsule-opt"
          class:on={uiPrefs.autoExpandOnComments}
          disabled={busy}
          onclick={() => {
            if (uiPrefs.autoExpandOnComments) return;
            uiPrefs = { ...uiPrefs, autoExpandOnComments: true };
            void run(async () => {
              await saveUiPrefs(uiPrefs);
            }, '已保存');
          }}
        >
          开
        </button>
        <button
          type="button"
          class="capsule-opt"
          class:on={!uiPrefs.autoExpandOnComments}
          disabled={busy}
          onclick={() => {
            if (!uiPrefs.autoExpandOnComments) return;
            uiPrefs = { ...uiPrefs, autoExpandOnComments: false };
            void run(async () => {
              await saveUiPrefs(uiPrefs);
            }, '已保存');
          }}
        >
          关
        </button>
      </div>
    </div>

    <div class="pref-stack">
      <div class="pref-row">
        <span class="pref-label">最大高度</span>
        <span class="pref-value">{uiPrefs.panelMaxVh}%</span>
      </div>
      <div class="range-wrap">
        <input
          type="range"
          class="pref-range"
          min={PANEL_MAX_VH_MIN}
          max={PANEL_MAX_VH_MAX}
          step={PANEL_MAX_VH_STEP}
          aria-label="面板最大高度"
          disabled={busy}
          value={uiPrefs.panelMaxVh}
          oninput={(e) => {
            const v = clampPanelMaxVh((e.currentTarget as HTMLInputElement).value);
            uiPrefs = { ...uiPrefs, panelMaxVh: v };
            void saveUiPrefs(uiPrefs);
          }}
          onchange={() => {
            status = '已保存';
            error = '';
          }}
        />
        <div class="range-marks" aria-hidden="true">
          {#each [PANEL_MAX_VH_MIN, 60, 80, PANEL_MAX_VH_MAX] as mark}
            <span style:left={`${((mark - PANEL_MAX_VH_MIN) / (PANEL_MAX_VH_MAX - PANEL_MAX_VH_MIN)) * 100}%`}>
              {mark}
            </span>
          {/each}
        </div>
      </div>
    </div>
  </section>

  <section class="card">
    <button
      type="button"
      class="card-toggle"
      onclick={() => (showSync = !showSync)}
      aria-expanded={showSync}
    >
      <h2 class="section-heading">
        同步
        {#if relayDirty}
          <span class="save-state">未保存</span>
        {/if}
      </h2>
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

      <h3 class="nostr-heading">
        <span>Nostr</span>
        <span class="relay-rule">多个中继至少 2 个接受即成功</span>
      </h3>
      <ul class="relay-list">
        {#each relayDrafts as relay (relay.id)}
          <li>
            <input
              type="text"
              class="relay-url"
              bind:value={relay.url}
              aria-label="Nostr Relay 地址"
              spellcheck="false"
            />
            {#if relay.url.trim()}
              {@const url = relay.url.trim()}
              {#if testingRelays[url]}
                <span class="relay-state testing">连接中…</span>
              {:else if relayResults[url]?.ok}
                <span class="relay-state ok">{relayResults[url].latencyMs} ms</span>
              {:else if relayResults[url]}
                <span class="relay-state fail" title={relayResults[url].error}>
                  {relayResults[url].error}
                </span>
              {/if}
              <button
                type="button"
                class="ghost relay-test"
                disabled={!!testingRelays[url]}
                onclick={() => void testRelayUrls([url])}
              >
                测试
              </button>
            {/if}
            <button
              type="button"
              class="remove-relay"
              title="移除"
              aria-label="移除中继"
              onclick={() => removeRelay(relay.id)}
            >
              ×
            </button>
          </li>
        {/each}
      </ul>

      <div class="relay-actions">
        <button type="button" class="ghost" onclick={addRelay}>添加中继</button>
        <button
          type="button"
          class="ghost"
          disabled={relayList.length === 0 || Object.keys(testingRelays).length > 0}
          onclick={() => void testRelayUrls(relayList)}
        >
          {Object.keys(testingRelays).length > 0 ? '测试中…' : '全部测试'}
        </button>
        <button
          type="button"
          disabled={busy || !settings || relayList.length === 0 || !relayDirty}
          onclick={() =>
            void run(async () => {
              if (!settings) return;
              await saveNostrSettingsApi({
                ...settings,
                relays: relayList,
              });
            })}
        >
          保存
        </button>
      </div>
    {/if}
  </section>

  <section class="card">
    <button
      type="button"
      class="card-toggle"
      onclick={() => (showPlatforms = !showPlatforms)}
      aria-expanded={showPlatforms}
    >
      <h2>支持的平台</h2>
      <span class="toggle-meta">
        <span class="pending muted-count">{platforms.length}</span>
        <span class="chevron" class:open={showPlatforms}>›</span>
      </span>
    </button>

    {#if showPlatforms}
      <ul class="pack-list">
        {#each platforms as p (p.id)}
          <li>
            <strong>{adapterLabel(p)}</strong>
          </li>
        {/each}
      </ul>
    {/if}
  </section>

  <section class="card danger-card">
    <h2>评论缓存</h2>
    <p class="cache-size">当前占用 <strong>{cacheSizeLabel}</strong></p>
    {#if !confirmClearCache}
      <p class="hint">删除本机已缓存的评论数据，不影响 Nostr 上的内容；之后可重新拉取。</p>
      <button
        type="button"
        class="ghost danger"
        disabled={busy}
        onclick={() => {
          confirmClearCache = true;
          confirmReset = false;
          status = '';
          error = '';
        }}
      >
        清空评论缓存
      </button>
    {:else}
      <p class="hint warn">将删除本机全部评论缓存，此操作不可撤销。</p>
      <div class="actions">
        <button
          type="button"
          class="danger-fill"
          disabled={busy}
          onclick={() =>
            void run(async () => {
              const n = await clearCommentsCacheApi();
              confirmClearCache = false;
              return n;
            }, '评论缓存已清空')}
        >
          确认清空
        </button>
        <button
          type="button"
          class="ghost"
          disabled={busy}
          onclick={() => {
            confirmClearCache = false;
          }}
        >
          取消
        </button>
      </div>
    {/if}
  </section>

  <section class="card danger-card">
    <h2>重置</h2>
    {#if !confirmReset}
      <p class="hint">清除身份、同步、面板偏好与草稿，不删除本机评论。</p>
      <button
        type="button"
        class="ghost danger"
        disabled={busy}
        onclick={() => {
          confirmReset = true;
          confirmClearCache = false;
          status = '';
          error = '';
        }}
      >
        重置所有配置
      </button>
    {:else}
      <p class="hint warn">将清除密钥与同步配置，此操作不可撤销。</p>
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
              showPlatforms = false;
              showExport = false;
              exportedNsec = '';
              nsecInput = '';
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

  h3 {
    margin: 2px 0 0;
    font-size: 12px;
    font-weight: 600;
    color: var(--sc-muted, #61666d);
  }

  .section-heading {
    display: flex;
    align-items: center;
    gap: 6px;
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

  .cache-size {
    margin: 0 0 8px;
    font-size: 13px;
    color: var(--sc-muted, #61666d);
  }

  .cache-size strong {
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    color: var(--sc-fg, #18191c);
  }

  .pending {
    margin: 0;
    font-size: 12px;
    font-weight: 600;
    color: #e6a23c;
  }

  .pending.muted-count {
    color: var(--sc-faint, #9499a0);
    font-weight: 500;
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
  input[type='password'] {
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

  .nostr-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .relay-rule {
    color: var(--sc-faint, #9499a0);
    font-size: 11px;
    font-weight: 400;
    text-align: right;
  }

  .relay-test {
    flex-shrink: 0;
    padding: 4px 8px;
    font-size: 11px;
  }

  .relay-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 4px;
  }

  .relay-list li {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    font-size: 11px;
  }

  input.relay-url {
    flex: 1;
    min-width: 0;
    padding: 6px 8px;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 11px;
    color: var(--sc-muted, #61666d);
  }

  .relay-state {
    max-width: 104px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 11px;
  }

  .relay-state.testing {
    color: var(--sc-faint, #9499a0);
  }

  .relay-state.ok {
    color: #2a7a3b;
  }

  .relay-state.fail {
    color: #c4564e;
  }

  .remove-relay {
    flex-shrink: 0;
    width: 24px;
    height: 24px;
    padding: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--sc-faint, #9499a0);
    font-size: 16px;
    font-weight: 400;
  }

  .remove-relay:hover {
    background: #fff0f0;
    color: #c4564e;
  }

  .relay-actions {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .save-state {
    color: #c47a2c;
    font-size: 11px;
    font-weight: 400;
    white-space: nowrap;
  }

  .relay-actions button:last-child {
    margin-left: auto;
  }

  .pref-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .pref-label {
    font-size: 12px;
    color: var(--sc-muted, #61666d);
  }

  .pref-stack {
    display: grid;
    gap: 6px;
    margin-top: 12px;
  }

  .pref-value {
    font-size: 12px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    color: var(--sc-fg, #18191c);
  }

  .pref-range {
    -webkit-appearance: none;
    appearance: none;
    display: block;
    width: 100%;
    height: 18px;
    margin: 0;
    background: transparent;
    cursor: pointer;
  }

  .pref-range:disabled {
    opacity: 0.6;
    cursor: default;
  }

  .pref-range:focus {
    outline: none;
  }

  .pref-range:focus-visible::-webkit-slider-thumb {
    box-shadow: 0 0 0 3px rgb(251 114 153 / 28%);
  }

  .pref-range:focus-visible::-moz-range-thumb {
    box-shadow: 0 0 0 3px rgb(251 114 153 / 28%);
  }

  .pref-range::-webkit-slider-runnable-track {
    height: 4px;
    border-radius: 999px;
    background: #e3e5e7;
  }

  .pref-range::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 16px;
    height: 16px;
    margin-top: -6px;
    border-radius: 50%;
    border: 2px solid #fff;
    background: var(--sc-accent, #fb7299);
    box-shadow: 0 1px 3px rgb(0 0 0 / 16%);
  }

  .pref-range::-moz-range-track {
    height: 4px;
    border-radius: 999px;
    background: #e3e5e7;
    border: 0;
  }

  .pref-range::-moz-range-thumb {
    width: 16px;
    height: 16px;
    border-radius: 50%;
    border: 2px solid #fff;
    background: var(--sc-accent, #fb7299);
    box-shadow: 0 1px 3px rgb(0 0 0 / 16%);
  }

  .range-wrap {
    display: grid;
    gap: 4px;
  }

  .range-marks {
    position: relative;
    height: 14px;
    margin: 0 8px;
  }

  .range-marks span {
    position: absolute;
    top: 0;
    transform: translateX(-50%);
    font-size: 10px;
    color: var(--sc-faint, #9499a0);
    font-variant-numeric: tabular-nums;
    line-height: 1;
  }

  .range-marks span:first-child {
    transform: translateX(0);
  }

  .range-marks span:last-child {
    transform: translateX(-100%);
  }

  .capsule {
    display: inline-flex;
    padding: 2px;
    border-radius: 999px;
    background: #f1f2f3;
    flex-shrink: 0;
  }

  .capsule-opt {
    border: 0;
    border-radius: 999px;
    padding: 4px 12px;
    background: transparent;
    color: var(--sc-faint, #9499a0);
    font: inherit;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
  }

  .capsule-opt.on {
    background: #fff;
    color: var(--sc-fg, #18191c);
    box-shadow: 0 1px 2px rgb(0 0 0 / 8%);
  }

  .capsule-opt:disabled {
    opacity: 0.6;
    cursor: default;
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

  .identity-actions {
    flex-wrap: nowrap;
  }

  .identity-save {
    flex-shrink: 0;
    margin-left: auto;
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
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    font-size: 12px;
    color: var(--sc-muted, #61666d);
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
