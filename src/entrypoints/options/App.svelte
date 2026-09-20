<script lang="ts">
  import { onMount } from 'svelte';
  import {
    clearNostrKeyApi,
    generateNostrKeyApi,
    getNostrSettings,
    importNostrKeyApi,
    saveNostrSettingsApi,
  } from '../../lib/messaging/api';
  import {
    DEFAULT_RELAYS,
    identityFromSettings,
    type NostrSettings,
  } from '../../lib/nostr/settings';
  import { shortNpub } from '../../lib/nostr/keys';

  let settings = $state<NostrSettings | null>(null);
  let nsecInput = $state('');
  let relayText = $state(DEFAULT_RELAYS.join('\n'));
  let showNsec = $state(false);
  let status = $state('');
  let error = $state('');
  let busy = $state(false);

  const identity = $derived(settings ? identityFromSettings(settings) : null);

  async function refresh() {
    settings = await getNostrSettings();
    relayText = settings.relays.join('\n');
    nsecInput = '';
  }

  function parseRelays(text: string): string[] {
    return text
      .split(/\n|,/)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  async function run(action: () => Promise<unknown>) {
    busy = true;
    error = '';
    status = '';
    try {
      await action();
      await refresh();
      status = '已保存';
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

<main class="page">
  <header>
    <h1>设置</h1>
    <p>用 Nostr 密钥作为身份，评论可同步到公共 relay 社区。</p>
  </header>

  {#if error}
    <p class="banner err">{error}</p>
  {:else if status}
    <p class="banner ok">{status}</p>
  {/if}

  <section class="card">
    <h2>身份</h2>
    {#if identity?.configured && identity.npub}
      <p class="mono" title={identity.npub}>{shortNpub(identity.npub)}</p>
      <p class="hint">完整 npub 请自行备份；私钥切勿泄露。</p>
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
        onclick={() =>
          void run(async () => {
            await generateNostrKeyApi();
          })}
      >
        生成新密钥
      </button>
      <button
        type="button"
        class="ghost"
        disabled={busy || !identity?.configured}
        onclick={() =>
          void run(async () => {
            await clearNostrKeyApi();
          })}
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
    <h2>社区 Relay</h2>
    <label class="check">
      <input
        type="checkbox"
        checked={settings?.publishEnabled ?? true}
        onchange={(e) => {
          if (settings) settings.publishEnabled = e.currentTarget.checked;
        }}
      />
      发评论时同步发布到 Nostr
    </label>
    <label class="field">
      <span>Relays（每行一个 wss://）</span>
      <textarea rows="5" bind:value={relayText}></textarea>
    </label>
    <button
      type="button"
      disabled={busy || !settings}
      onclick={() =>
        void run(async () => {
          if (!settings) return;
          await saveNostrSettingsApi({
            ...settings,
            relays: parseRelays(relayText),
          });
        })}
    >
      保存社区设置
    </button>
  </section>
</main>

<style>
  :global(body) {
    margin: 0;
    background: #f7f8fa;
    color: #18191c;
    font-family:
      'PingFang SC',
      'Hiragino Sans GB',
      'Microsoft YaHei',
      'Segoe UI',
      system-ui,
      sans-serif;
  }

  .page {
    max-width: 520px;
    margin: 0 auto;
    padding: 24px 16px 40px;
    display: grid;
    gap: 14px;
  }

  header h1 {
    margin: 0;
    font-size: 20px;
  }

  header p {
    margin: 6px 0 0;
    color: #61666d;
    font-size: 13px;
  }

  .card {
    display: grid;
    gap: 10px;
    padding: 14px;
    border-radius: 12px;
    background: #fff;
    border: 1px solid #e3e5e7;
  }

  h2 {
    margin: 0;
    font-size: 14px;
  }

  .mono {
    margin: 0;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 13px;
    color: #fb7299;
  }

  .hint {
    margin: 0;
    font-size: 12px;
    color: #9499a0;
  }

  .field {
    display: grid;
    gap: 6px;
    font-size: 12px;
    color: #61666d;
  }

  input[type='text'],
  input[type='password'],
  textarea {
    width: 100%;
    box-sizing: border-box;
    border: 1px solid #e3e5e7;
    border-radius: 8px;
    padding: 8px 10px;
    font: inherit;
    font-size: 13px;
    color: #18191c;
    background: #fff;
  }

  textarea {
    resize: vertical;
    min-height: 96px;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  }

  .check {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    color: #61666d;
  }

  .actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  button {
    border: 0;
    border-radius: 8px;
    padding: 8px 12px;
    background: #fb7299;
    color: #fff;
    font: inherit;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
  }

  button.ghost {
    background: #f1f2f3;
    color: #61666d;
  }

  button:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .banner {
    margin: 0;
    padding: 8px 10px;
    border-radius: 8px;
    font-size: 13px;
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
