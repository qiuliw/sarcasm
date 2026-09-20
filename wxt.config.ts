import { readFileSync } from 'node:fs';
import { defineConfig } from 'wxt';

const extensionKey = readFileSync(
  new URL('./extension-key.b64', import.meta.url),
  'utf8',
).trim();

export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-svelte'],
  manifest: {
    // 固定扩展 ID，便于自动化测试（见 extension-id.txt）
    key: extensionKey,
    action: {
      default_title: 'sarcasm',
    },
    name: 'sarcasm',
    description: '抖音 / B站外挂评论：Nostr 身份，本地存储并可同步到 relay',
    permissions: ['storage', 'alarms'],
    host_permissions: [
      '*://*.bilibili.com/*',
      '*://*.douyin.com/*',
      'wss://*/*',
    ],
    // MV3 默认 script-src 'self' 禁止实例化 WASM；sql.js 需要此项
    content_security_policy: {
      extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self';",
    },
  },
});
