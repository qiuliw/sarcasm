export type { ContentKind, PlatformAdapter } from './types';
export { CONTENT_KIND_LABEL, adapterLabel, hostMatches } from './types';
export { bilibili } from './bilibili';
export { douyin, douyinVideo } from './douyin';
export {
  getPlatformAdapter,
  listPlatformAdapters,
  observeHref,
  resolvePageContext,
  resolvePageContextSync,
} from './registry';
