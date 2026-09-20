/** 可导入导出的 URL 锚点规则。 */

export const ANCHOR_SCHEMA_VERSION = 1;

export interface VideoIdRule {
  /** 从 URL 路径或查询参数提取。 */
  from: 'path' | 'query';
  /** 第一个捕获组作为视频 ID。 */
  pattern: string;
  /** from=query 时的参数名。 */
  queryKey?: string;
  /** 添加到 ID 前的固定前缀，例如 av。 */
  prefix?: string;
}

export interface AnchorRuleFixture {
  url: string;
  expectedId: string;
}

export interface AnchorPack {
  id: string;
  name: string;
  /** 主机后缀，例如 bilibili.com。 */
  hosts: string[];
  /** URL 路径至少包含其中一项；省略则不限制。 */
  pathIncludes?: string[];
  videoIdRules: VideoIdRule[];
  /** 平台 ID 改变时，将新提取值映射到原规范 ID。 */
  aliases?: Record<string, string>;
  /** 导入时自动执行的规则样例。 */
  tests?: AnchorRuleFixture[];
}

export interface AnchorRulesDocument {
  schemaVersion: number;
  packs: AnchorPack[];
}

export const BUILTIN_PACKS: AnchorPack[] = [
  {
    id: 'bilibili',
    name: 'B站·视频',
    hosts: ['bilibili.com'],
    pathIncludes: ['/video/'],
    videoIdRules: [
      { from: 'path', pattern: '/video/(BV[\\w]+)' },
      { from: 'query', queryKey: 'bvid', pattern: '^(BV[\\w]+)$' },
      { from: 'path', pattern: '/video/av(\\d+)', prefix: 'av' },
    ],
    tests: [
      {
        url: 'https://www.bilibili.com/video/BV1GJ411x7h7/',
        expectedId: 'BV1GJ411x7h7',
      },
    ],
  },
  {
    id: 'douyin',
    name: '抖音·视频',
    hosts: ['douyin.com'],
    videoIdRules: [
      { from: 'path', pattern: '/video/(\\d+)' },
      { from: 'query', queryKey: 'modal_id', pattern: '^(\\d+)$' },
    ],
    tests: [
      {
        url: 'https://www.douyin.com/video/7123456789012345678',
        expectedId: '7123456789012345678',
      },
      {
        url: 'https://www.douyin.com/jingxuan?modal_id=7654524171870899499',
        expectedId: '7654524171870899499',
      },
    ],
  },
];

function hostMatches(hostname: string, hosts: string[]): boolean {
  const host = hostname.toLowerCase();
  return hosts.some((entry) => {
    const suffix = entry.toLowerCase().replace(/^\./, '');
    return host === suffix || host.endsWith(`.${suffix}`);
  });
}

export function packMatches(pack: AnchorPack, url: URL): boolean {
  if (!hostMatches(url.hostname, pack.hosts)) return false;
  return (
    !pack.pathIncludes?.length ||
    pack.pathIncludes.some((part) => url.pathname.includes(part))
  );
}

export function extractVideoId(pack: AnchorPack, url: URL): string | null {
  for (const rule of pack.videoIdRules) {
    try {
      const source =
        rule.from === 'path'
          ? url.pathname
          : rule.queryKey
            ? url.searchParams.get(rule.queryKey)
            : null;
      if (!source) continue;
      const match = source.slice(0, 4096).match(new RegExp(rule.pattern, 'i'));
      if (match?.[1]) {
        const extracted = `${rule.prefix ?? ''}${match[1]}`;
        return pack.aliases?.[extracted] ?? extracted;
      }
    } catch {
      // Invalid imported regex: ignore this rule.
    }
  }
  return null;
}

export function validatePack(raw: unknown): AnchorPack {
  if (!raw || typeof raw !== 'object') throw new Error('规则包不是对象');
  const pack = raw as Partial<AnchorPack>;
  if (!pack.id || typeof pack.id !== 'string') throw new Error('缺少 id');
  if (!/^[a-z][a-z0-9_-]{0,31}$/i.test(pack.id)) throw new Error('id 格式无效');
  if (!pack.name || typeof pack.name !== 'string') throw new Error('缺少 name');
  if (!Array.isArray(pack.hosts) || !pack.hosts.length) throw new Error('缺少 hosts');
  if (!Array.isArray(pack.videoIdRules) || !pack.videoIdRules.length) {
    throw new Error('缺少 videoIdRules');
  }

  const rules = pack.videoIdRules.map((rawRule) => {
    if (!rawRule || typeof rawRule !== 'object') throw new Error('规则项无效');
    const rule = rawRule as Partial<VideoIdRule>;
    if (rule.from !== 'path' && rule.from !== 'query') throw new Error('from 无效');
    if (typeof rule.pattern !== 'string' || !rule.pattern) throw new Error('缺少 pattern');
    if (rule.pattern.length > 512) throw new Error('pattern 过长');
    if (rule.from === 'query' && !rule.queryKey) throw new Error('query 规则缺少 queryKey');
    new RegExp(rule.pattern, 'i');
    return {
      from: rule.from,
      pattern: rule.pattern,
      queryKey: typeof rule.queryKey === 'string' ? rule.queryKey : undefined,
      prefix: typeof rule.prefix === 'string' ? rule.prefix : undefined,
    } satisfies VideoIdRule;
  });

  const aliases =
    pack.aliases && typeof pack.aliases === 'object' && !Array.isArray(pack.aliases)
      ? Object.fromEntries(
          Object.entries(pack.aliases)
            .filter(([from, to]) => from && typeof to === 'string' && to)
            .map(([from, to]) => [from.slice(0, 256), to.slice(0, 256)]),
        )
      : undefined;
  const tests = Array.isArray(pack.tests)
    ? pack.tests.map((rawTest) => {
        if (!rawTest || typeof rawTest !== 'object') throw new Error('测试项无效');
        const test = rawTest as Partial<AnchorRuleFixture>;
        if (typeof test.url !== 'string' || !test.url) throw new Error('测试缺少 url');
        if (typeof test.expectedId !== 'string' || !test.expectedId) {
          throw new Error('测试缺少 expectedId');
        }
        new URL(test.url);
        return {
          url: test.url,
          expectedId: test.expectedId,
        };
      })
    : undefined;

  const cleaned: AnchorPack = {
    id: pack.id,
    name: pack.name.slice(0, 64),
    hosts: pack.hosts.map(String).filter(Boolean),
    pathIncludes: Array.isArray(pack.pathIncludes)
      ? pack.pathIncludes.map(String).filter(Boolean)
      : undefined,
    videoIdRules: rules,
    aliases,
    tests,
  };

  for (const test of cleaned.tests ?? []) {
    const url = new URL(test.url);
    if (!packMatches(cleaned, url)) throw new Error(`测试 URL 不匹配规则：${test.url}`);
    const actual = extractVideoId(cleaned, url);
    if (actual !== test.expectedId) {
      throw new Error(`规则测试失败：期望 ${test.expectedId}，实际 ${actual ?? '空'}`);
    }
  }
  return cleaned;
}

export function parseRulesDocument(raw: unknown): AnchorRulesDocument {
  if (!raw || typeof raw !== 'object') throw new Error('锚点规则文档不是对象');
  const document = raw as Partial<AnchorRulesDocument>;
  if (typeof document.schemaVersion !== 'number') throw new Error('缺少 schemaVersion');
  if (document.schemaVersion !== ANCHOR_SCHEMA_VERSION) {
    throw new Error(`不支持规则格式 v${document.schemaVersion}`);
  }
  if (!Array.isArray(document.packs)) throw new Error('缺少 packs');
  return {
    schemaVersion: ANCHOR_SCHEMA_VERSION,
    packs: document.packs.map(validatePack),
  };
}

export function createRulesDocument(packs: AnchorPack[]): AnchorRulesDocument {
  return {
    schemaVersion: ANCHOR_SCHEMA_VERSION,
    packs: packs.map(validatePack),
  };
}
