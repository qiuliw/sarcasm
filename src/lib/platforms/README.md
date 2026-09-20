# 平台适配

每个适配器描述 **站点 + 内容类型**（如抖音·视频），并在 `resolve` 里耦合解析 ID 与 DOM。

## 新增

1. 新建 `src/lib/platforms/<id>.ts`
2. 填 `site` / `kind` / `name`，实现 `match` + `resolve`
3. 在 `registry.ts` 注册
4. 更新 `src/entrypoints/content/index.ts` 的 `matches`

## 内置

| id | 展示 | 类型 |
| --- | --- | --- |
| bilibili | B站·视频 | video |
| douyin | 抖音·视频 | video |
