# sarcasm

国内毕竟是人多，创造力大，视频也是我们周遭琐事，所引起的共鸣很大，非外网所能比。只要把评论这种数据量少但信息密度高的拉取回去就好，就算不能发主要内容，也无所谓，长篇大论不好说，那就对着它碎碎念。

在 B 站视频与文章、抖音视频页面注入**独立评论面板**的浏览器插件。

技术栈：**WXT（MV3）+ Svelte 5 + sql.js**。评论按内容 ID 挂载，经 Nostr relay 同步。

<img width="693" height="719" alt="image" src="https://github.com/user-attachments/assets/917641e6-bb6e-490e-8343-c55639557798" />

## 功能

- 内容页右下角悬浮评论面板
- **锚点规则**：用 URL 路径或查询参数解析内容 ID，支持 JSON 导入、导出和 ID 映射
- Nostr 身份（`nsec`）与显示名
- 异步发到 Nostr（失败重试 + 永久失败进垃圾桶）
- 打开面板时从 Nostr relay **拉取**同一内容的评论（别人 / 另一端）
- 面板设置：身份 / 面板偏好 / 同步 / 锚点规则 / 评论缓存 / 重置

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
- 私钥 `nsec` 仅用于签名 Nostr 事件，不会上传到本项目服务器
- 「重置所有配置」会清除身份 / 同步 / 自定义锚点规则 / 草稿，**不会**删除本机评论

## 架构（简）

| 层 | 职责 |
| --- | --- |
| Content UI | Shadow DOM 悬浮面板 |
| Background | SQLite CRUD、出站队列、消息 |
| 锚点规则 | `src/lib/anchors/*` → `platform` + `videoId` |
| 事件源 | 本地必写；Nostr 走队列发布 |

规则格式、ID 映射与限制见 [`docs/anchor-rules.md`](docs/anchor-rules.md)。

```sql
comments(
  id, platform, video_id,
  parent_id, native_parent_id, reply_to_author,
  author, author_pubkey, body,
  likes, dislikes, my_vote,
  created_at, updated_at
)
```

## 说明

- `extension-key.b64` / `extension-id.txt` 用于固定扩展 ID，方便冒烟测试
- 站点 URL 或 ID 改版时更新锚点规则即可，不必修改面板逻辑

## License

MIT
