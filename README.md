# sarcasm

国内毕竟是人多，创造力大，视频也是我们周遭琐事，所引起的共鸣很大，非外网所能比。只要把评论这种数据量少但信息密度高的拉取回去就好，就算不能发主要内容，也无所谓，长篇大论不好说，那就对这你碎碎念

在 B 站 / 抖音视频页注入**独立评论面板**的浏览器插件。

技术栈：**WXT（MV3）+ Svelte 5 + sql.js**。评论按视频 ID 挂载，经 Nostr relay 同步。

<img width="693" height="719" alt="image" src="https://github.com/user-attachments/assets/917641e6-bb6e-490e-8343-c55639557798" />

## 功能

- 视频页右下角悬浮评论面板
- **平台适配插件**：按站点 + 内容类型（如抖音·视频）解析 ID 与 DOM
- Nostr 身份（`nsec`）与显示名
- 异步发到 Nostr（失败重试 + 永久失败进垃圾桶）
- 打开面板时从 Nostr relay **拉取**同视频评论（别人 / 另一端）
- 面板设置：身份 / 面板偏好 / 同步 / 平台 / 评论缓存 / 重置

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
- 「重置所有配置」会清除身份 / 同步 / 草稿，**不会**删除本机评论

## 架构（简）

| 层 | 职责 |
| --- | --- |
| Content UI | Shadow DOM 悬浮面板 |
| Background | SQLite CRUD、出站队列、消息 |
| 平台适配 | `src/lib/platforms/*` → `platform` + `videoId` + `title` |
| 事件源 | 本地必写；Nostr 走队列发布 |

新增站点：见 [`src/lib/platforms/README.md`](src/lib/platforms/README.md)。

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
- 站点改版通常改对应平台适配器即可，不必动面板逻辑

## License

MIT
