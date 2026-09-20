# sarcasm

在 B 站 / 抖音视频页注入**独立评论面板**的浏览器插件。

技术栈：**WXT（MV3）+ Svelte 5 + sql.js**。评论按视频 ID 挂载，本机存储，可选后台同步到 Nostr relay。

## 功能

- 视频页右下角悬浮评论面板
- JSON **锚点规则包**（内置 B 站 / 抖音，可导入导出）
- Nostr 身份（`nsec`）与显示名
- 本地 SQLite；可选异步发到 Nostr（失败重试 + 永久失败进垃圾桶）
- 面板内设置：身份 / 同步 / 锚点 / 重置配置

## 开发安装

需要 [Bun](https://bun.sh/) 与 Chrome/Chromium。

```bash
bun install
bun run dev
```

若浏览器未自动打开，到 `chrome://extensions` 开启「开发者模式」，加载 `.output/chrome-mv3-dev`。

```bash
bun run build   # 产物 .output/chrome-mv3
bun run zip     # 打包 zip
bun run test:unit
bun run test    # 单元测试 + Chrome 冒烟
```

## 隐私

- 评论与草稿保存在本机 `chrome.storage.local`
- 私钥 `nsec` 仅在开启 Nostr 发布时用于签名上链，不会上传到本项目服务器
- 「重置所有配置」会清除身份 / 同步 / 自定义锚点 / 草稿，**不会**删除本机评论

## 架构（简）

| 层 | 职责 |
| --- | --- |
| Content UI | Shadow DOM 悬浮面板 |
| Background | SQLite CRUD、出站队列、消息 |
| 锚点 | 主机 / 路径规则 → `platform` + `videoId` |
| 事件源 | 本地必写；Nostr 走队列发布 |

```sql
comments(
  id, platform, video_id,
  parent_id, reply_to_author,
  author, body,
  likes, dislikes, my_vote,
  created_at, updated_at
)
```

## 说明

- `extension-key.b64` / `extension-id.txt` 用于固定扩展 ID，方便冒烟测试
- 站点改版通常只需更新锚点 JSON，不必改代码

## License

MIT
