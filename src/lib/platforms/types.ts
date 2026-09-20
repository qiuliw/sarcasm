import type { PageContext } from '../db/types';

/** 内容类型：短视频 / 直播等 */
export type ContentKind = 'video' | 'live';

export const CONTENT_KIND_LABEL: Record<ContentKind, string> = {
  video: '视频',
  live: '直播',
};

/** 平台适配：站点 + 内容类型；ID 与 DOM 在 resolve 里一起处理 */
export interface PlatformAdapter {
  /** 稳定 id，写入评论 platform 字段 */
  id: string;
  /** 站点名，如「抖音」 */
  site: string;
  /** 内容类型 */
  kind: ContentKind;
  /** 完整展示名，如「抖音·视频」；可不填，由 site + kind 生成 */
  name?: string;
  version: number;
  /** 主机后缀，如 douyin.com；也用于 content_scripts.matches */
  hosts: string[];
  match(url: URL): boolean;
  resolve(url: URL, doc: Document): Pick<PageContext, 'videoId' | 'title'> | null;
}

export function hostMatches(hostname: string, hosts: string[]): boolean {
  const host = hostname.toLowerCase();
  return hosts.some((h) => {
    const needle = h.toLowerCase().replace(/^\./, '');
    return host === needle || host.endsWith(`.${needle}`);
  });
}

export function adapterLabel(adapter: PlatformAdapter): string {
  return `${adapter.site}·${CONTENT_KIND_LABEL[adapter.kind]}`;
}
