<script lang="ts">
  import { onMount } from 'svelte';
  import { getNostrIdentity, getStats } from '../../lib/messaging/api';
  import type { NostrIdentity } from '../../lib/nostr/settings';

  let count = $state<number | null>(null);
  let identity = $state<NostrIdentity | null>(null);
  let error = $state('');
  let ready = $state(false);

  onMount(() => {
    void Promise.all([getStats(), getNostrIdentity()])
      .then(([s, id]) => {
        count = s.count;
        identity = id;
      })
      .catch((e) => {
        error = e instanceof Error ? e.message : String(e);
      })
      .finally(() => {
        ready = true;
      });
  });
</script>

<main class="shell">
  <header class="head">
    <div>
      <h1>sarcasm</h1>
      <p>抖音 · B站 · Nostr</p>
    </div>
  </header>

  <section class="stat">
    <span>本机评论</span>
    {#if !ready}
      <strong class="muted">…</strong>
    {:else if error}
      <strong class="err">—</strong>
    {:else}
      <strong>{count}</strong>
    {/if}
  </section>

  <section class="stat">
    <span>Nostr 身份</span>
    {#if !ready}
      <strong class="muted">…</strong>
    {:else if identity?.configured}
      <strong class="npub">{identity.shortLabel}</strong>
    {:else}
      <strong class="warn">未配置</strong>
    {/if}
  </section>

  {#if error}
    <p class="err-banner">{error}</p>
  {/if}

  <ol class="steps">
    <li><span>1</span>打开抖音 / B 站视频页</li>
    <li><span>2</span>右下角打开面板，点齿轮进设置</li>
    <li><span>3</span>配置或导入 nsec 后发评</li>
  </ol>

  <footer>
    {#if identity?.publishEnabled && identity.configured}
      发评会同步到 Nostr relay
    {:else}
      评论先保存在本机
    {/if}
  </footer>
</main>

<style>
  :global(body) {
    margin: 0;
    min-width: 280px;
    max-width: 280px;
    font-family:
      'PingFang SC',
      'Hiragino Sans GB',
      'Microsoft YaHei',
      'Segoe UI',
      system-ui,
      sans-serif;
    background: #fff;
    color: #18191c;
  }

  .shell {
    padding: 12px;
    display: grid;
    gap: 10px;
  }

  .head {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  h1 {
    margin: 0;
    font-size: 15px;
    font-weight: 650;
  }

  .head p {
    margin: 2px 0 0;
    font-size: 11px;
    color: #9499a0;
  }

  .stat {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
    padding: 8px 10px;
    border-radius: 8px;
    background: #f1f2f3;
    color: #61666d;
    font-size: 12px;
  }

  .stat strong {
    font-size: 14px;
    font-weight: 700;
    color: #18191c;
  }

  .stat strong.muted {
    color: #9499a0;
  }

  .stat strong.npub {
    font-size: 12px;
    font-weight: 600;
    color: #fb7299;
  }

  .stat strong.warn {
    color: #e6a23c;
    font-size: 12px;
  }

  .err-banner {
    margin: 0;
    padding: 8px 10px;
    border-radius: 8px;
    background: #fff0f0;
    color: #f85a54;
    font-size: 12px;
    line-height: 1.4;
  }

  .steps {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 7px;
  }

  .steps li {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    color: #61666d;
  }

  .steps span {
    width: 18px;
    height: 18px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    background: #fff0f3;
    color: #fb7299;
    font-size: 10px;
    font-weight: 700;
  }

  footer {
    padding-top: 8px;
    border-top: 1px solid #e3e5e7;
    font-size: 11px;
    color: #9499a0;
  }
</style>
