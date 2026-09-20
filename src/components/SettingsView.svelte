<script lang="ts">
  import { onMount } from 'svelte';
  import {
    clearCustomAnchorPacks,
    clearNostrKeyApi,
    exportAnchorPacks,
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
  import { shortNpub } from '../lib/nostr/keys';
  import type { AnchorPack } from '../lib/anchors/packs';
  import { BACKEND_META, type BackendId } from '../lib/backends/dispatch';

  interface Props {
    compact?: boolean;
    onSaved?: () => void;
  }

  let { compact = false, onSaved }: Props = $props();

  let settings = $state<NostrSettings | null>(null);
  let nsecInput = $state('');
  let relayText = $state(DEFAULT_RELAYS.join('\n'));
  let showNsec = $state(false);
  let status = $state('');
  let error = $state('');
  let busy = $state(false);
  let enabledBackends = $state<BackendId[]>(['nostr']);
  let packs = $state<AnchorPack[]>([]);
  let customCount = $state(0);
  let packJson = $state('');

  const identity = $derived(settings ? identityFromSettings(settings) : null);

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
    const meta = BACKEND_META.find((b) => b.id === id);
    if (!meta?.ready) return;
    if (on) enabledBackends = [...new Set([...enabledBackends, id])];
    else enabledBackends = enabledBackends.filter((x) => x !== id);
  }

  async function run(action: () => Promise<unknown>) {
    busy = true;
    error = '';
    status = '';
    try {
      await action();
      await refresh();
      status = '已保存';
      onSaved?.();
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      busy = false;
    }
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
      <p>身份、事件源、锚点规则。</p>
    </header>
  {/if}

  {#if error}
    <p class="banner err">{error}</p>
  {:else if status}
    <p class="banner ok">{status}</p>
  {/if}

  <section class="card">
    <h2>身份</h2>
    {#if identity?.configured && identity.npub}
      <p class="mono" title={identity.npub}>{shortNpub(identity.npub)}</p>
      <p class="hint">私钥切勿泄露。</p>
    {:else}
      <p class="hint">尚未配置密钥，无法发评。</p>
    {/if}

    <label class="field">
      <span>显示名（可选）</span>
      <input
        type="text"
        maxlength="32"
        placeholder="不填则显示短 npub"
        value={settings?.displayName ?? ''}
        oninput={(e) => {
          if (settings) settings.displayName = e.currentTarget.value;
        }}
      />
    </label>

    <div class="actions">
      <button
        type="button"
        disabled={busy}
        onclick={() => void run(async () => generateNostrKeyApi())}
      >
        生成新密钥
      </button>
      <button
        type="button"
        class="ghost"
        disabled={busy || !identity?.configured}
        onclick={() => void run(async () => clearNostrKeyApi())}
      >
        清除密钥
      </button>
    </div>

    <label class="field">
      <span>导入 nsec</span>
      <input
        type={showNsec ? 'text' : 'password'}
        placeholder="nsec1…"
        bind:value={nsecInput}
        autocomplete="off"
      />
    </label>
    <label class="check">
      <input type="checkbox" bind:checked={showNsec} />
      显示私钥
    </label>
    <button
      type="button"
      disabled={busy || !nsecInput.trim()}
      onclick={() =>
        void run(async () => {
          await importNostrKeyApi(nsecInput);
          nsecInput = '';
        })}
    >
      导入密钥
    </button>
  </section>

  <section class="card">
    <h2>事件源</h2>
    <p class="hint">本地始终写入；下面是额外同步。</p>
    {#each BACKEND_META as backend (backend.id)}
      <label class="check">
        <input
          type="checkbox"
          disabled={!backend.ready}
          checked={enabledBackends.includes(backend.id)}
          onchange={(e) => toggleBackend(backend.id, e.currentTarget.checked)}
        />
        {backend.name}{backend.ready ? '' : '（未接入）'}
      </label>
    {/each}

    {#if enabledBackends.includes('nostr')}
      <label class="field">
        <span>Nostr Relays（每行一个）</span>
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
        Nostr 发布开关
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
      保存事件源
    </button>
  </section>

  <section class="card">
    <h2>锚点规则</h2>
    <p class="hint">
      {packs.length} 套（自定义 {customCount}）
    </p>
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
        disabled={busy}
        onclick={() =>
          void run(async () => {
            packJson = await exportAnchorPacks(true);
          })}
      >
        导出
      </button>
      <button
        type="button"
        class="ghost"
        disabled={busy || customCount === 0}
        onclick={() => void run(async () => clearCustomAnchorPacks())}
      >
        清空自定义
      </button>
    </div>
    <label class="field">
      <span>导入 JSON</span>
      <textarea
        rows={compact ? 4 : 6}
        bind:value={packJson}
        placeholder={'[{"id":"example", ...}]'}
      ></textarea>
    </label>
    <button
      type="button"
      disabled={busy || !packJson.trim()}
      onclick={() => void run(async () => importAnchorPacks(packJson))}
    >
      导入规则包
    </button>
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
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 12px;
    color: var(--sc-accent, #fb7299);
    word-break: break-all;
  }

  .hint {
    margin: 0;
    font-size: 12px;
    color: var(--sc-faint, #9499a0);
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
