<script lang="ts">
  import SettingsView from '../../components/SettingsView.svelte';
</script>

<main class="page">
  <SettingsView />
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
  }
</style>
