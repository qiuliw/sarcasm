<script lang="ts">
  import { onMount } from 'svelte';
  import { getStats } from '../../lib/messaging/api';

  let count = $state<number | null>(null);
  let error = $state('');
  let ready = $state(false);

  onMount(() => {
    void getStats()
      .then((s) => {
        count = s.count;
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
    <div class="brand">
      <span class="mark" aria-hidden="true">外</span>
      <div>
        <h1>sarcasm</h1>
        <p>抖音 · B站 独立评论层</p>
      </div>
    </div>
    <span class="status-dot" title="插件已启用" aria-label="插件已启用"></span>
  </header>

  <section class="stat" aria-live="polite" aria-label="本地评论数">
    <span>本机已存</span>
    {#if !ready}
      <strong class="muted">…</strong>
    {:else if error}
      <strong class="err">—</strong>
    {:else}
      <strong>{count}</strong>
    {/if}
  </section>

  {#if error}
    <p class="err-banner">{error}</p>
  {/if}

  <ol class="steps">
    <li><span>1</span>打开抖音或 B 站视频页</li>
    <li><span>2</span>点右下角粉色按钮展开面板</li>
    <li><span>3</span>原评论旁点「外评」可锚定回复</li>
  </ol>

  <footer>评论只保存在当前浏览器，换机不同步</footer>
</main>

<style>
  :global(body) {
    margin: 0;
    min-width: 300px;
    max-width: 300px;
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
    padding: 14px;
    display: grid;
    gap: 12px;
  }

  .head {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .mark {
    width: 36px;
    height: 36px;
    border-radius: 10px;
    display: grid;
    place-items: center;
    background: #fb7299;
    color: #fff;
    font-size: 14px;
    font-weight: 700;
    box-shadow: 0 2px 8px rgb(251 114 153 / 30%);
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

  .status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #fb7299;
    box-shadow: 0 0 0 4px #fff0f3;
  }

  .stat {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    padding: 10px 12px;
    border-radius: 8px;
    background: #f1f2f3;
    color: #61666d;
    font-size: 12px;
  }

  .stat strong {
    font-size: 18px;
    font-weight: 700;
    color: #18191c;
    font-variant-numeric: tabular-nums;
  }

  .stat strong.muted {
    color: #9499a0;
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
    gap: 8px;
  }

  .steps li {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    color: #61666d;
  }

  .steps span {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    background: #fff0f3;
    color: #fb7299;
    font-size: 11px;
    font-weight: 700;
  }

  footer {
    padding-top: 10px;
    border-top: 1px solid #e3e5e7;
    font-size: 11px;
    color: #9499a0;
  }
</style>
