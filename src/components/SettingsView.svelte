<script lang="ts">
  import { onMount } from 'svelte';
  import {
    clearCustomAnchorPacks,
    clearNostrKeyApi,
    exportAnchorPacks,
    exportNostrKeyApi,
    generateNostrKeyApi,
    getEnabledBackends,
    getNostrSettings,
    importAnchorPacks,
    importNostrKeyApi,
    listAnchorPacks,
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

  interface Props {
    compact?: boolean;
    onSaved?: () => void;
  }

  let { compact = false, onSaved }: Props = $props();

  let settings = $state<NostrSettings | null>(null);
  let nsecInput = $state('');
  let exportedNsec = $state('');
  let showExport = $state(false);
  let showImport = $state(false);
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
  const identityLabel = $derived(
    identity?.configured
      ? identity.displayName || '已配置'
      : '未配置',
  );

  async function refresh() {
    settings = await getNostrSettings();
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
      status = '密钥已导出';
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
    <h2>显示名</h2>
    <div class="inline-row">
      <input
        type="text"
        maxlength="32"
        placeholder="可选"
        value={settings?.displayName ?? ''}
        oninput={(e) => {
          if (settings) settings.displayName = e.currentTarget.value;
        }}
      />
      <button
        type="button"
        class="save-sm"
        disabled={busy || !settings}
        onclick={() =>
          void run(async () => {
            if (!settings) return;
            await saveNostrSettingsApi(settings);
          }, '显示名已保存')}
      >
        保存
      </button>
    </div>
  </section>

  <section class="card">
    <h2>密钥</h2>
    <p class="mono" class:muted={!identity?.configured}>{identityLabel}</p>

    <div class="actions">
      <button
        type="button"
        disabled={busy}
        onclick={() =>
          void run(async () => {
            exportedNsec = '';
            showExport = false;
            await generateNostrKeyApi();
          }, '密钥已生成')}
      >
        生成
      </button>
      <button
        type="button"
        class="ghost"
        disabled={busy || !identity?.configured}
        onclick={() => void exportKey()}
      >
        导出
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
        导入
      </button>
      <button
        type="button"
        class="ghost"
        disabled={busy || !identity?.configured}
        onclick={() =>
          void run(async () => {
            exportedNsec = '';
            showExport = false;
            showImport = false;
            await clearNostrKeyApi();
          }, '密钥已清除')}
      >
        清除
      </button>
    </div>

    {#if showExport && exportedNsec}
      <label class="field">
        <span>nsec</span>
        <input type="text" readonly value={exportedNsec} />
      </label>
      <button type="button" class="ghost" disabled={busy} onclick={() => void copyText(exportedNsec, '已复制到剪贴板')}>
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
          }, '密钥已导入')}
      >
        确认导入
      </button>
    {/if}
  </section>

  <section class="card">
    <h2>同步</h2>
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

  .mono {
    margin: 0;
    font-size: 12px;
    font-weight: 500;
    color: var(--sc-accent, #fb7299);
  }

  .mono.muted {
    color: var(--sc-faint, #9499a0);
    font-weight: 400;
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
