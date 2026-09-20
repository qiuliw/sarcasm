/** 可导入导出的页面锚点规则（数据，不是抽象层） */

export interface VideoIdRule {
  /** path | query | html */
  from: 'path' | 'query' | 'html';
  /** 正则，第 1 捕获组为 id */
  pattern: string;
  /** query 时的参数名 */
  queryKey?: string;
  /** 拼到 id 前，如 av */
  prefix?: string;
}

export interface AnchorPack {
  id: string;
  name: string;
  version: number;
  /** 主机后缀，如 bilibili.com / douyin.com */
  hosts: string[];
  /** 路径需包含的片段，可选 */
  pathIncludes?: string[];
  videoIdRules: VideoIdRule[];
  titleSelectors?: string[];
  titleStrip?: string;
}

export const BUILTIN_PACKS: AnchorPack[] = [
  {
    id: 'bilibili',
    name: 'B站',
    version: 1,
    hosts: ['bilibili.com'],
    pathIncludes: ['/video/'],
    videoIdRules: [
      { from: 'path', pattern: '/video/(BV[\\w]+)' },
      { from: 'query', queryKey: 'bvid', pattern: '^(BV[\\w]+)$' },
      { from: 'path', pattern: '/video/av(\\d+)', prefix: 'av' },
    ],
    titleSelectors: ['h1', '.video-title', '[class*="video-title"]'],
    titleStrip: '_哔哩哔哩.*$',
  },
  {
    id: 'douyin',
    name: '抖音',
    version: 1,
    hosts: ['douyin.com'],
    videoIdRules: [
      { from: 'path', pattern: '/video/(\\d+)' },
      { from: 'query', queryKey: 'modal_id', pattern: '^(\\d+)$' },
      { from: 'html', pattern: '"awemeId"\\s*:\\s*"(\\d+)"' },
    ],
    titleSelectors: [
      '[data-e2e="video-desc"]',
      '[data-e2e="browse-video-desc"]',
      '.video-info-detail',
    ],
  },
];

export function hostMatches(hostname: string, hosts: string[]): boolean {
  const host = hostname.toLowerCase();
  return hosts.some((h) => {
    const needle = h.toLowerCase().replace(/^\./, '');
    return host === needle || host.endsWith(`.${needle}`);
  });
}

export function packMatches(pack: AnchorPack, url: URL): boolean {
  if (!hostMatches(url.hostname, pack.hosts)) return false;
  if (pack.pathIncludes?.length) {
    return pack.pathIncludes.some((p) => url.pathname.includes(p));
  }
  return true;
}

export function extractVideoId(pack: AnchorPack, url: URL, doc: Document): string | null {
  for (const rule of pack.videoIdRules) {
    try {
      if (rule.from === 'path') {
        const m = url.pathname.match(new RegExp(rule.pattern, 'i'));
        if (m?.[1]) return `${rule.prefix ?? ''}${m[1]}`;
      }
      if (rule.from === 'query' && rule.queryKey) {
        const raw = url.searchParams.get(rule.queryKey);
        if (!raw) continue;
        const m = raw.match(new RegExp(rule.pattern, 'i'));
        if (m?.[1]) return `${rule.prefix ?? ''}${m[1]}`;
      }
      if (rule.from === 'html') {
        const m = doc.documentElement.innerHTML.match(new RegExp(rule.pattern, 'i'));
        if (m?.[1]) return `${rule.prefix ?? ''}${m[1]}`;
      }
    } catch {
      // bad regex in pack — skip
    }
  }
  return null;
}

export function readTitle(pack: AnchorPack, doc: Document): string | undefined {
  for (const sel of pack.titleSelectors ?? []) {
    try {
      const text = doc.querySelector(sel)?.textContent?.trim();
      if (text) {
        if (pack.titleStrip) {
          return text.replace(new RegExp(pack.titleStrip), '').trim() || text;
        }
        return text.slice(0, 120);
      }
    } catch {
      // ignore
    }
  }
  const t = doc.title?.trim();
  return t ? t.slice(0, 120) : undefined;
}

export function validatePack(raw: unknown): AnchorPack {
  if (!raw || typeof raw !== 'object') throw new Error('规则包不是对象');
  const p = raw as Partial<AnchorPack>;
  if (!p.id || typeof p.id !== 'string') throw new Error('缺少 id');
  if (!/^[a-z][a-z0-9_-]{0,31}$/i.test(p.id)) throw new Error('id 格式无效');
  if (!p.name || typeof p.name !== 'string') throw new Error('缺少 name');
  if (!Array.isArray(p.hosts) || !p.hosts.length) throw new Error('缺少 hosts');
  if (!Array.isArray(p.videoIdRules) || !p.videoIdRules.length) {
    throw new Error('缺少 videoIdRules');
  }
  for (const rule of p.videoIdRules) {
    if (!rule || typeof rule !== 'object') throw new Error('规则项无效');
    if (!['path', 'query', 'html'].includes(rule.from)) throw new Error('from 无效');
    if (typeof rule.pattern !== 'string' || !rule.pattern) throw new Error('缺少 pattern');
  }
  return {
    id: p.id,
    name: p.name,
    version: typeof p.version === 'number' ? p.version : 1,
    hosts: p.hosts.map(String),
    pathIncludes: Array.isArray(p.pathIncludes) ? p.pathIncludes.map(String) : undefined,
    videoIdRules: p.videoIdRules as VideoIdRule[],
    titleSelectors: Array.isArray(p.titleSelectors) ? p.titleSelectors.map(String) : undefined,
    titleStrip: typeof p.titleStrip === 'string' ? p.titleStrip : undefined,
  };
}
