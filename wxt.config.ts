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
    description: '抖音 / B站独立评论层：按视频 ID 与评论 ID 动态锚定回复，本地 SQLite 存储',
    permissions: ['storage'],
    host_permissions: [
      '*://*.bilibili.com/*',
      '*://*.douyin.com/*',
    ],
    // MV3 默认 script-src 'self' 禁止实例化 WASM；sql.js 需要此项
    content_security_policy: {
      extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self';",
    },
  },
});
