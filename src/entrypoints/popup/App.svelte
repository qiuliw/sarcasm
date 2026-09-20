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
    <div>
      <h1>外挂评论</h1>
      <p>抖音 · B站</p>
    </div>
    <span class="status-dot" title="插件已启用" aria-label="插件已启用"></span>
  </header>

  <section class="stat" aria-live="polite" aria-label="本地评论数">
    <span>本地评论</span>
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
    <li><span>2</span>点击右下角粉色评论按钮</li>
    <li><span>3</span>在原评论旁点「外评」可锚定回复</li>
  </ol>

  <footer>评论仅保存在当前浏览器</footer>
</main>

<style>
  :global(body) {
    margin: 0;
    min-width: 292px;
    max-width: 292px;
    font-family:
      'Avenir Next',
      'Segoe UI',
      'PingFang SC',
      'Hiragino Sans GB',
      'Microsoft YaHei',
      sans-serif;
    background: #fff;
    color: #1c1d22;
  }

  .shell {
    padding: 1rem;
    display: grid;
    gap: 0.8rem;
  }

  .head {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  h1 {
    margin: 0;
    font-size: 0.95rem;
    font-weight: 650;
  }

  .head p {
    margin: 0.14rem 0 0;
    font-size: 0.7rem;
    color: #8c8982;
  }

  .status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #0f8a72;
    box-shadow: 0 0 0 4px #e4f3ef;
  }

  .stat {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    padding: 0.65rem 0.75rem;
    border-radius: 10px;
    background: #f5f4f1;
    color: #6b6862;
    font-size: 0.76rem;
  }

  .stat strong {
    font-size: 1.1rem;
    font-weight: 700;
    color: #1c1d22;
  }

  .stat strong.muted {
    color: #9a968e;
  }

  .err-banner {
    margin: 0;
    padding: 0.55rem 0.7rem;
    border-radius: 8px;
    background: #fdecea;
    color: #b42318;
    font-size: 0.78rem;
    line-height: 1.4;
  }

  .steps {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.55rem;
  }

  .steps li {
    display: flex;
    align-items: center;
    gap: 0.55rem;
    font-size: 0.76rem;
    color: #4d4b46;
  }

  .steps span {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    background: #e4f3ef;
    color: #0f6b5c;
    font-size: 0.66rem;
    font-weight: 700;
  }

  footer {
    padding-top: 0.65rem;
    border-top: 1px solid #efede8;
    font-size: 0.68rem;
    color: #9a968e;
  }
</style>
