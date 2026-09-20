# 锚点规则

锚点规则把页面 URL 转换为稳定的 `规则 ID + 视频 ID`。评论只依赖这个锚点，不读取视频标题或页面 DOM。

## 文件格式

导入、导出统一使用严格的 JSON 文档：

```json
{
  "schemaVersion": 1,
  "packs": [
    {
      "id": "example",
      "name": "示例视频",
      "hosts": ["example.com"],
      "pathIncludes": ["/video/"],
      "videoIdRules": [
        {
          "from": "path",
          "pattern": "/video/(\\d+)"
        },
        {
          "from": "query",
          "queryKey": "video_id",
          "pattern": "^(\\d+)$"
        }
      ],
      "tests": [
        {
          "url": "https://example.com/video/42",
          "expectedId": "42"
        }
      ]
    }
  ]
}
```

- `schemaVersion`：当前固定为 `1`。其他版本会拒绝导入，不做自动迁移。
- `id`：稳定的平台/内容命名空间。修改它会形成新的评论区。
- `hosts`：允许匹配的主机后缀。
- `pathIncludes`：可选的路径初筛条件。
- `videoIdRules`：按顺序尝试，首个成功结果成为视频 ID。
- `pattern`：必须用第一个捕获组返回 ID。
- `prefix`：可选，例如将数字 AV 号规范为 `av123`。
- `tests`：可选；导入时执行，任一失败都会拒绝整个规则文件。

自定义规则与内置规则 `id` 相同时会覆盖内置规则；“重置”会删除所有自定义规则。

## 平台 ID 映射

平台更换 ID 后，可以用 `aliases` 把页面上的新 ID 映射回已有评论使用的稳定 ID：

```json
{
  "aliases": {
    "new-9001": "old-42"
  }
}
```

映射方向是“提取到的 ID → 稳定 ID”。建议同时添加测试：

```json
{
  "url": "https://example.com/video/new-9001",
  "expectedId": "old-42"
}
```

规则无法判断两个不同 ID 是否确实指向同一视频，因此映射必须由规则维护者明确提供。

## 安全与限制

- 规则只支持 URL `path` 和 `query`，不读取 DOM、标题或任意网络响应。
- 规则文件不能包含或执行 JavaScript。
- 正则表达式最长 512 个字符。
- 当前扩展清单只授权 B站和抖音域名。其他域名的规则即使可以导入，也需要在扩展清单中增加对应站点权限并重新构建。
- 不支持任意平台改版后的自动恢复；规则更新、ID 映射和测试样例需要同步维护。

