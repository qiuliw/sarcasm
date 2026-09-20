# sarcasm

用 **Svelte + WXT（Manifest V3）** 做的浏览器插件：在抖音、B 站视频页注入独立评论侧栏，按 **视频 ID** 挂载外挂评论。数据先落在扩展内的 **SQLite（sql.js）**，方便以后换成自建后端。

## 和现有项目的区别

搜过一圈，**没有同款「独立外挂评论层 + 双平台视频锚点 + SQLite」**：

| 项目 | 做什么 | 和本插件差异 |
| --- | --- | --- |
| [comment_copilot](https://github.com/mustcanbedo/comment_copilot) | 采集原生评论、AI 拟回复并填回站内输入框 | 仍走平台原生评论，不是独立评论区 |
| [Kindly-Web](https://github.com/ClauBloom/Kindly-Web) | 改写 B 站负面评论 | 改写已有评论，不新建评论层 |
| [bilibili-comment-capture](https://github.com/Liu-Bot24/bilibili-comment-capture) | 抓取/导出 B 站评论 | 只读导出 |
| [douyin-helper](https://github.com/iamaluckyguy/douyin-helper) | 保持抖音原生评论区展开等 | 增强原生 UI，无独立存储评论 |

因此本仓库是从零实现的 MVP。

## 功能

- 识别当前视频锚点：`bilibili` 的 `BVxxxx` / `av`，`douyin` 的数字 `awemeId`
- 回复视频（`video_id`）
- 回复外挂评论（`parent_id`，两级楼）
- 点赞 / 点踩（可切换、再点取消）
- 本地 SQLite schema 已按可同步后端设计

## 开发

环境要求：已安装 [Bun](https://bun.sh/) 和 Chrome/Chromium。

```bash
cd sarcasm
bun install
bun run dev
```

`bun run dev` 会启动 WXT 开发服务器，生成开发版扩展到
`.output/chrome-mv3-dev`，并尝试打开一个已安装该扩展的独立浏览器窗口。
保持该命令运行，修改 `src/` 下的代码后即可触发热更新。

如果浏览器没有自动打开，首次使用时手动加载：

1. 打开 Chrome 的 `chrome://extensions`。
2. 开启右上角「开发者模式」。
3. 点击「加载已解压的扩展程序」。
4. 选择项目中的 `.output/chrome-mv3-dev` 目录。
5. 打开或刷新一个 B 站/抖音视频页进行调试。

热更新说明：

- popup 和 Svelte 组件更新后会自动刷新。
- content script 与 background service worker 更新后，WXT 会自动重载扩展。
- 已经打开的视频页若没有显示最新 content script，手动刷新该网页。
- 修改 `wxt.config.ts`、manifest 配置或依赖后，建议停止开发服务器并重新执行
  `bun run dev`。
- 按 `Ctrl+C` 停止开发服务器。

生产构建与测试：

```bash
bun run build   # 产物在 .output/chrome-mv3
bun run zip     # .output/sarcasm-0.1.0-chrome.zip
bun run test    # 单元测试 + Chrome 冒烟（SQLite CRUD + B站注入）
```

## 已验证

- MV3 CSP 含 `'wasm-unsafe-eval'`，service worker 内 sql.js WASM 可实例化
- popup → background：CRUD / 点赞点踩 / 楼中楼 / 级联删除 / stats
- B 站视频页注入 `<sarcasm-root>` 并识别 `videoId`

## 数据模型（便于以后接后端）

```sql
comments(
  id, platform, video_id,
  parent_id,          -- 外挂楼中楼
  reply_to_author,
  author, body,
  likes, dislikes, my_vote,
  created_at, updated_at
)
```

持久化：`sql.js` 导出二进制 → `chrome.storage.local`。后端上线后只需把 CRUD 从 background 消息改成 HTTP，锚点字段可原样迁移。

## 注意

- 视频 ID 来自 URL，相对稳；站点改版主要影响页面识别，不影响已存评论。
- 仅本机存储，清扩展数据会丢评论；多设备同步要等你的服务器。
